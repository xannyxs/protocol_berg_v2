import { join } from "path";
import fs from "fs/promises";
import { Readable } from "stream";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import { google } from "googleapis";
import { exit } from "process";

const CREDENTIALS_PATH = join(process.cwd(), "credentials.json");
const SPREADSHEET_ID = "1G6mHLw9Y8h8pN4g-b0VNm1djx7eJLcMpXZtZB4JSm9E";
const SHEET_NAME = "Sessions";
const REMOTION_ENTRY_POINT = join(process.cwd(), "src", "index.ts");
const ASSET_FOLDER = join(process.cwd(), "output_assets");

/* const STAGE_TO_FOLDER_ID_MAP = {
	"Main Stage": "YOUR_MAIN_STAGE_FOLDER_ID",
	"Community Stage": "YOUR_COMMUNITY_STAGE_FOLDER_ID",
	"Stage 1": "YOUR_STAGE_1_FOLDER_ID",
	"Stage 2": "YOUR_STAGE_2_FOLDER_ID",
}; */
const DEFAULT_DRIVE_FOLDER_ID = "1vMdKFqW--3_Y6imkjwex_DsI2P9os7Sb"; // Fallback (parent folder)

const getGoogleAuth = async () => {
	const auth = new google.auth.GoogleAuth({
		keyFile: CREDENTIALS_PATH,
		scopes: [
			"https://www.googleapis.com/auth/spreadsheets.readonly",
			"https://www.googleapis.com/auth/drive.file",
		],
	});
	return auth.getClient();
};

const getSheetData = async (authClient: any) => {
	const sheets = google.sheets({ version: "v4", auth: authClient });
	try {
		console.log(`Workspaceing data from sheet: ${SHEET_NAME}`);
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: SPREADSHEET_ID,
			range: `${SHEET_NAME}!A:P`,
		});

		const allRows = response.data.values;
		if (!allRows || allRows.length < 3) {
			console.log(
				"No sufficient data found in the sheet (expected data from row 3).",
			);
			process.exit(1);
		}

		const headers = allRows[1].map((header) => String(header || "").trim());
		const dataRows = allRows.slice(2);

		const data = dataRows
			.map((row) => {
				const rowData: any = {};
				if (row[0] === undefined || String(row[0]).trim() === "") {
					return null;
				}
				headers.forEach((header, index) => {
					rowData[header] =
						row[index] !== undefined ? String(row[index]).trim() : "";
				});
				return rowData;
			})
			.filter(Boolean);

		console.log(`Successfully fetched and processed ${data.length} sessions.`);
		return data;
	} catch (err) {
		console.error("Error fetching or parsing sheet data:", err);
		process.exit(1);
	}
};

const uploadToDrive = async (
	authClient: any,
	filePath: any,
	fileName: any,
	folderId: any,
) => {
	const drive = google.drive({ version: "v3", auth: authClient });
	const fileMetadata = {
		name: fileName,
		parents: [folderId],
	};
	const media = {
		body: Readable.from(await fs.readFile(filePath)),
	};

	try {
		console.log(`Uploading "${fileName}" to Drive Folder ID: ${folderId}...`);
		const file = await drive.files.create({
			requestBody: fileMetadata,
			media: media,
			fields: "id, name, webViewLink",
		});
		console.log(
			`Successfully uploaded "${file.data.name}" (ID: ${file.data.id}).`,
		);
		console.log(`View link: ${file.data.webViewLink}`);
		return file.data;
	} catch (err) {
		console.error(`Error uploading "${fileName}" to Drive:`, err);

		process.exit(1);
	}
};

async function processSessions() {
	console.log("Starting Remotion render and upload process...");
	await fs.mkdir(ASSET_FOLDER, { recursive: true });

	let auth;
	try {
		auth = await getGoogleAuth();
	} catch (e) {
		console.error("Google Authentication failed:", e.message);
		console.error(
			"Ensure 'credentials.json' is valid and has correct permissions for Sheets and Drive.",
		);
		exit(1);
	}

	const sessions = await getSheetData(auth);
	if (!sessions || sessions.length === 0) {
		console.log("No sessions to process.");
		return;
	}

	console.log("Bundling Remotion project...");
	const bundled = await bundle({
		entryPoint: REMOTION_ENTRY_POINT,
	});
	console.log("Remotion project bundled.");

	const remotionComps = await getCompositions(bundled);
	if (!remotionComps || remotionComps.length === 0) {
		console.error(
			"No Remotion compositions found. Check your Remotion project.",
		);
		return;
	}

	// --- IMPORTANT: Select your Target Remotion Composition ---
	// Option 1: Use the first composition found (if you only have one relevant one)
	// const targetRemotionComp = remotionComps[0];
	// Option 2: Specify by ID (Recommended)
	const targetRemotionCompId = "MainComposition"; // <--- !!! CHANGE THIS to your actual Remotion comp ID !!!
	const targetRemotionComp = remotionComps.find(
		(c) => c.id === targetRemotionCompId,
	);

	if (!targetRemotionComp) {
		console.error(
			`Remotion composition with ID "${targetRemotionCompId}" not found.`,
		);
		console.log(
			"Available compositions:",
			remotionComps.map((c) => c.id).join(", "),
		);
		return;
	}
	console.log(
		`Using Remotion composition: "${targetRemotionComp.id}" (Duration: ${targetRemotionComp.durationInFrames} frames)`,
	);

	for (const session of sessions) {
		const sessionTitle = session["Title of the session"];
		if (!sessionTitle) {
			// Basic check to skip rows that might be completely empty but not filtered out
			console.warn("Skipping session due to missing title.");
			continue;
		}

		const sessionId =
			sessionTitle
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "") || `session-${Date.now()}`;
		const description = session["Description"] || "";
		const stage = session["Stage"] || "";
		const day = session["Day"] || ""; // e.g., "2024-07-20"
		const startTime = session["Start"] || ""; // e.g., "10:00"
		// const endTime = session["End"] || ""; // Available if needed
		const sessionType = session["Session Type"] || ""; // E.g. "Still", "Animation", "Talk", "Workshop"

		const speakers = [];
		for (let i = 1; i <= 6; i++) {
			const speakerName = session[`Speaker ${i}`];
			if (speakerName && String(speakerName).trim() !== "") {
				speakers.push({
					id: String(speakerName)
						.trim()
						.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^a-z0-9-]/g, ""),
					name: String(speakerName).trim(),
				});
			}
		}

		console.log(`\nProcessing session: "${sessionTitle}" (ID: ${sessionId})`);

		let startTimestamp = Date.now(); // Default to now if parsing fails
		if (day && startTime) {
			// Assuming 'day' is YYYY-MM-DD and 'startTime' is HH:MM
			// Be careful with timezones. This creates a date object based on system's local timezone.
			// If sheet times are UTC, ensure they are marked or parsed as such.
			// For UTC, you might construct as: `${day}T${startTime}:00Z`
			const dateTimeString = `${day} ${startTime}`; // e.g., "2024-07-20 10:00"
			const parsedDate = new Date(dateTimeString);
			if (!isNaN(parsedDate.getTime())) {
				startTimestamp = parsedDate.getTime();
			} else {
				console.warn(
					`Could not parse date/time for session "${sessionTitle}": ${dateTimeString}. Using current time as fallback.`,
				);
			}
		} else {
			console.warn(
				`Missing Day or Start time for session "${sessionTitle}". Using current time as fallback.`,
			);
		}

		const inputProps = {
			id: sessionId,
			name: sessionTitle,
			description: description,
			stage: stage,
			start: startTimestamp,
			speakers: speakers,
			placeholderUrl: session["Placeholder Url"] || "",
			meerkatQrUrl: session["Meerkat QR Url"] || "",
			animationUrl: session["Animation Url"] || "",
			// Add any other props your Remotion component expects
		};

		console.log("Render Input Props:", JSON.stringify(inputProps, null, 2));

		// Determine render type: Use "Session Type" column if it's 'Still' or 'Animation', else fallback
		let renderTypeDecision = "animation"; // Default
		if (sessionType.toLowerCase() === "still") {
			renderTypeDecision = "still";
		} else if (sessionType.toLowerCase() === "animation") {
			renderTypeDecision = "animation";
		} else {
			// Fallback if "Session Type" is not explicitly 'Still' or 'Animation'
			renderTypeDecision =
				targetRemotionComp.durationInFrames === 1 ? "still" : "animation";
		}
		console.log(`Determined render type: ${renderTypeDecision}`);

		let outputFilePath;
		let outputFileName;

		try {
			if (renderTypeDecision === "still") {
				outputFileName = `${sessionId}.png`;
				outputFilePath = join(ASSET_FOLDER, outputFileName);
				console.log(`Rendering Still: ${outputFileName}`);
				await renderStill({
					composition: targetRemotionComp,
					serveUrl: bundled,
					output: outputFilePath,
					inputProps: inputProps,
				});
			} else {
				// Animation
				outputFileName = `${sessionId}.mp4`;
				outputFilePath = join(ASSET_FOLDER, outputFileName);
				console.log(`Rendering Animation: ${outputFileName}`);
				await renderMedia({
					codec: "h264",
					composition: targetRemotionComp,
					serveUrl: bundled,
					outputLocation: outputFilePath,
					inputProps: inputProps,
				});
			}
			console.log(`Successfully rendered: ${outputFilePath}`);

			const targetFolderId =
				STAGE_TO_FOLDER_ID_MAP[stage] || DEFAULT_DRIVE_FOLDER_ID;
			if (!STAGE_TO_FOLDER_ID_MAP[stage]) {
				console.warn(
					`Warning: Stage "${stage}" not found in mapping. Uploading to default folder: ${DEFAULT_DRIVE_FOLDER_ID}`,
				);
			}

			await uploadToDrive(auth, outputFilePath, outputFileName, targetFolderId);
			// Optionally, delete local file
			// await fs.unlink(outputFilePath);
			// console.log(`Deleted local file: ${outputFilePath}`);
		} catch (error) {
			console.error(
				`Failed to process session "${sessionTitle}":`,
				error.message,
			);
			// Continue with the next session
		}
	}
	console.log("\nAll sessions processed.");
}

// --- Run the script ---
processSessions()
	.then(() => {
		console.log("Script finished successfully.");
		process.exit(0);
	})
	.catch((err) => {
		console.error("\nAn unhandled error occurred in the main process:", err);
		process.exit(1);
	});
