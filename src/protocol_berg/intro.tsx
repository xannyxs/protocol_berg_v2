import { loadFont } from "@remotion/fonts";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";
import { z } from "zod";

// export const { fontFamily } = loadFont();

export interface SpeakerProps {
	id: string;
	name: string;
	photo?: string;
}

export interface SessionProps {
	name: string;
	start: number;
	end: number;
	speakers: SpeakerProps[];
}

export type Props = {
	type: string;
	session: SessionProps;
	id: string;
};

export const compositionSchema = z.object({
	id: z.string(),
	type: z.string(),
	name: z.string(),
	start: z.number(),
	speakers: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			photo: z.string().optional(),
		}),
	),
});

export const Intro: React.FC<z.infer<typeof compositionSchema>> = (props) => {
	console.log(props);
	const showTitle = 90;

	return (
		<AbsoluteFill>
			<AbsoluteFill>
				<Sequence
					name="Base Video"
					from={0}
					durationInFrames={175}
					layout="none"
				>
					<OffthreadVideo src={staticFile("ProtocolBerg_animation.mp4")} />
				</Sequence>
			</AbsoluteFill>

			<Sequence>
				<div className="flex absolute right-0 top-8 flex-col gap-4 text-4xl text-right text-white">
					<span>Istanbul, Turkey</span>
				</div>
			</Sequence>
		</AbsoluteFill>
	);
};
