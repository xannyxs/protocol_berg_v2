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

const getSheetData = async (auth: any) => {
	const sheets = google.sheets({ version: "v4", auth });
	try {
		console.log(`Workspaceing data from sheet: ${SHEET_NAME}`);
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: SPREADSHEET_ID,
			range: `${SHEET_NAME}!A:Z`, // Read all columns up to Z, adjust if wider
		});
		const rows = response.data.values;
		if (!rows || rows.length === 0) {
			console.log("No data found in the sheet.");
			return [];
		}

		const headers = rows[0].map((header) => header.trim());
		const data = rows.slice(1).map((row) => {
			const rowData: any = {};

			headers.forEach((header, index) => {
				rowData[header] = row[index] !== undefined ? row[index] : ""; // Handle empty cells
			});
			return rowData;
		});

		console.log(`Successfully fetched ${data.length} sessions.`);
		return data;
	} catch (err) {
		console.error("Error fetching sheet data:", err);
		exit(1);
	}
};

const uploadToDrive = async (
	auth: any,
	filePath: string,
	fileName: string,
	folderId: string,
) => {
	const drive = google.drive({ version: "v3", auth });
	const fileMetadata = {
		name: fileName,
		parents: [folderId],
	};
	const media = {
		body: Readable.from(await fs.readFile(filePath)), // Use stream for large files
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
		exit(1);
	}
};

// --- Main Render and Upload Logic ---
async function processSessions() {
	console.log("Starting Remotion render and upload process...");
	await fs.mkdir(ASSET_FOLDER, { recursive: true });

	let auth = await getGoogleAuth().catch((e) => {
		console.error("Google Authentication failed:", e);
		console.error(
			"Ensure 'credentials.json' is valid and has correct permissions for Sheets and Drive.",
		);
		exit(1);
	});

	const sessions = await getSheetData(auth);
	if (sessions.length === 0) return;

	console.log("Bundling Remotion project...");
	const bundled = await bundle({
		entryPoint: REMOTION_ENTRY_POINT,
	});
	console.log("Remotion project bundled.");

	const remotionComps = await getCompositions(bundled);
	if (remotionComps.length === 0) {
		console.error(
			"No Remotion compositions found. Check your Remotion project.",
		);
		return;
	}
	// --- IMPORTANT: Select your Remotion Composition ---
	// Option 1: Use the first composition found
	// const targetRemotionComp = remotionComps[0];
	// Option 2: Specify by ID (Recommended if you have multiple)
	const targetRemotionCompId = "MainComposition"; // <--- CHANGE THIS to your actual Remotion comp ID
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
	console.log(`Using Remotion composition: "${targetRemotionComp.id}"`);

	for (const session of sessions) {
		// --- Construct inputProps from session data ---
		// This needs to match your Remotion component's expected props
		// And the column names in your Google Sheet
		const sessionName = session["Session Title"] || "Untitled Session"; // Example column name
		const sessionId =
			session["Session ID"] ||
			sessionName.toLowerCase().replace(/\s+/g, "-") ||
			`session-${Date.now()}`;
		const sessionStartStr = session["Start Date & Time (UTC)"]; // Example: "2024-07-28 14:00"
		const speakersStr = session["Speakers"] || ""; // Example: "Ada Lovelace, Charles Babbage"
		const renderType =
			session["Render Type"] ||
			(targetRemotionComp.durationInFrames === 1 ? "Still" : "Animation"); // "Still" or "Animation"
		// const stage = session["Stage"] || "";

		console.log(`\nProcessing session: "${sessionName}" (ID: ${sessionId})`);

		const inputProps = {
			id: sessionId,
			name: sessionName,
			start: sessionStartStr
				? new Date(sessionStartStr + "Z").getTime()
				: Date.now(), // Append Z if UTC, parse carefully
			speakers: speakersStr
				.split(",")
				.map((name: any) => name.trim())
				.filter(Boolean) // Remove empty names
				.map((name: any) => ({
					id: name
						.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^a-z0-9-]/g, ""),
					name: name,
				})),
			// Add any other props your Remotion component needs based on sheet columns
			// e.g., track: session["Track"], description: session["Description"]
		};

		console.log("Render Input Props:", JSON.stringify(inputProps, null, 2));

		let outputFilePath;
		let outputFileName;

		if (renderType.toLowerCase() === "still") {
			outputFileName = `${sessionId}.png`;
			outputFilePath = join(ASSET_FOLDER, outputFileName);
			console.log(`Rendering Still: ${outputFileName}`);
			try {
				await renderStill({
					composition: targetRemotionComp,
					serveUrl: bundled,
					output: outputFilePath,
					inputProps: inputProps,
					// imageFormat: 'jpeg', // if you prefer jpeg
				});
			} catch (renderError) {
				console.error(
					`Error rendering Still for "${sessionName}":`,
					renderError,
				);
				continue; // Skip to next session
			}
		} else {
			// Default to animation
			outputFileName = `${sessionId}.mp4`;
			outputFilePath = join(ASSET_FOLDER, outputFileName);
			console.log(`Rendering Animation: ${outputFileName}`);
			try {
				await renderMedia({
					codec: "h264",
					composition: targetRemotionComp,
					serveUrl: bundled,
					outputLocation: outputFilePath,
					inputProps: inputProps,
					// quality: 'high', // Optional
					// concurrency: null, // Uses all available cores
				});
			} catch (renderError) {
				console.error(
					`Error rendering Animation for "${sessionName}":`,
					renderError,
				);
				continue; // Skip to next session
			}
		}
		console.log(`Successfully rendered: ${outputFilePath}`);

		const targetFolderId = DEFAULT_DRIVE_FOLDER_ID;

		try {
			await uploadToDrive(auth, outputFilePath, outputFileName, targetFolderId);
			// Optionally, delete the local file after successful upload
			// await fs.unlink(outputFilePath);
			// console.log(`Deleted local file: ${outputFilePath}`);
		} catch (uploadError) {
			console.error(
				`Failed to upload "${outputFileName}" for session "${sessionName}".`,
			);
			// Decide if you want to stop or continue
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
