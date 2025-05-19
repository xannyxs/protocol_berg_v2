import { join } from "path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";

start()
	.then(() => {
		process.exit(0);
	})
	.catch((err) => {
		console.log(err);
		process.exit(1);
	});

async function start() {
	console.log(`Run Remotion renderer..`);

	const bundled = await bundle({
		entryPoint: join(process.cwd(), "src", "index.ts"),
	});

	const compositions = await getCompositions(bundled);
	if (compositions.length === 0) {
		console.log("No compositions found for. Skip rendering");
		return;
	}

	const assetFolder = join(process.cwd(), "assets");
	const inputProps = {
		type: "1",
		id: "evm-summit",
		name: "Input Prop Session",
		start: 1694248200000,
		speakers: [],
	};

	for (const composition of compositions) {
		if (composition.durationInFrames === 1) {
			console.log(`Render still for ${composition.id}`);
			await renderStill({
				composition,
				serveUrl: bundled,
				output: `${assetFolder}/${composition.id}.png`,
				inputProps: inputProps,
			});
		}

		if (composition.durationInFrames > 1) {
			await renderMedia({
				codec: "h264",
				composition,
				serveUrl: bundled,
				outputLocation: `${assetFolder}/${composition.id}.mp4`,
				inputProps: inputProps,
			});
		}
	}
}
