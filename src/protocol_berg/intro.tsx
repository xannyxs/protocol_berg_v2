import { loadFont } from "@remotion/fonts";
import dayjs from "dayjs";
import {
	AbsoluteFill,
	CompositionProps,
	Img,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
} from "remotion";
import { z } from "zod";
import { CreateAvatar } from "../utils/createAvatar";

const fontFamily = "LM";

loadFont({
	family: fontFamily,
	url: staticFile("LM-regular.ttf"),
	weight: "500",
}).then(() => {
	console.log("Font loaded!");
});

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
	session: SessionProps;
	id: string;
};

export const compositionSchema = z.object({
	id: z.string(),
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
	const frame = useCurrentFrame();
	const default_fps = 25;

	const introTime = 3.5 * default_fps;
	const sessionTime = 7 * default_fps;
	const fadeTime = introTime + default_fps / 2;

	const delayedOpacity = interpolate(
		frame,
		[introTime + 15, fadeTime + 15],
		[0, 1],
	);

	const titleClassName = () => {
		console.log("title length #", props.name);
		let className = "w-full font-bold text-center";
		if (props.name.length >= 140) className += " text-6xl leading-none";
		if (props.name.length > 40 && props.name.length < 140)
			className += " text-7xl leading-tight";
		if (props.name.length < 40) className += " text-[9rem]";

		return className;
	};

	const speakersClassName = () => {
		console.log("# of speakers", props.speakers.length);
		let className = "flex flex-row";
		if (props.speakers.length >= 7) className += " gap-8";
		if (props.speakers.length > 3 && props.speakers.length < 7)
			className += " gap-16";
		if (props.speakers.length <= 3) className += " gap-24";

		return className;
	};

	return (
		<AbsoluteFill className="text-white">
			<AbsoluteFill>
				<Sequence name="Base Video" layout="none">
					<OffthreadVideo src={staticFile("ProtocolBerg_animation.mp4")} />
				</Sequence>
			</AbsoluteFill>

			<AbsoluteFill
				className="flex relative flex-col justify-end pb-12"
				style={{ opacity: delayedOpacity }}
			>
				<Sequence
					name="Title"
					from={introTime + 10}
					durationInFrames={sessionTime}
					layout="none"
				>
					<h1 className={titleClassName()} style={{ fontFamily }}>
						{props.name}
					</h1>
				</Sequence>

				<Sequence name="Speakers" layout="none">
					<div className="flex justify-center items-center mt-10 w-full">
						<div className={speakersClassName()}>
							{props.speakers.map((i) => {
								return (
									<div key={i.id} className="flex flex-col gap-4 items-center">
										<Img
											className="object-cover w-32 h-32 rounded-full"
											src={CreateAvatar(i.name)}
										/>
										<span
											style={{ fontFamily }}
											className="w-48 text-3xl font-medium leading-normal text-center"
										>
											{i.name}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				</Sequence>
			</AbsoluteFill>

			<div
				style={{ opacity: delayedOpacity }}
				className="flex absolute top-5 right-5 flex-col gap-4 text-4xl text-right"
			>
				<Sequence name="Datetime" layout="none">
					<span style={{ fontFamily: fontFamily }}>
						{dayjs(props.start).format("MMMM DD, YYYY")}
					</span>
				</Sequence>
			</div>
		</AbsoluteFill>
	);
};
