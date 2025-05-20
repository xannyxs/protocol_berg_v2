import "./index.css";
import { Composition, staticFile } from "remotion";
import { MOCK_SESSION } from "./utils/mocks";
import { Intro } from "./protocol_berg/intro";
import { loadFont } from "@remotion/fonts";

const fontFamily = "LM";

loadFont({
	family: fontFamily,
	url: staticFile("LM-regular.ttf"),
	weight: "500",
}).then(() => {
	console.log("Font loaded!");
});

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition
				id="Protocol-Berg"
				component={Intro}
				durationInFrames={175}
				fps={25}
				width={1920}
				height={1080}
				defaultProps={MOCK_SESSION[3]}
			/>
		</>
	);
};
