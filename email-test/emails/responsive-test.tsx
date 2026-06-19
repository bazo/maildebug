import {
	Body,
	Column,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	Row,
	Section,
	Text,
} from "react-email";

// A purpose-built fixture for the responsive preview feature. It carries real
// @media breakpoints in a <style> block so the viewport switcher (and the
// integration test) have something whose layout actually changes by width.
const css = `
@media only screen and (max-width: 600px) {
	.headline { font-size: 22px !important; }
	.col { display: block !important; width: 100% !important; }
	.hide-mobile { display: none !important; }
}
`;

interface ResponsiveTestEmailProps {
	headline?: string;
}

export const ResponsiveTestEmail = ({
	headline = "Responsive preview test",
}: ResponsiveTestEmailProps) => (
	<Html>
		<Head>
			<style
				// react-email renders this into <head>; lettersanitizer keeps @media.
				dangerouslySetInnerHTML={{ __html: css }}
			/>
		</Head>
		<Preview>This email changes layout at the 600px breakpoint.</Preview>
		<Body style={main}>
			<Container style={container}>
				<Heading className="headline" style={headlineStyle}>
					{headline}
				</Heading>
				<Text style={paragraph}>
					On wide viewports the two cards sit side by side. Below 600px they stack, the
					headline shrinks, and the right-hand note disappears.
				</Text>
				<Section>
					<Row>
						<Column className="col" style={column}>
							<Text style={cardTitle}>Left column</Text>
							<Text style={paragraph}>
								Visible at every width. Stacks under the other column on mobile.
							</Text>
						</Column>
						<Column className="col" style={column}>
							<Text style={cardTitle}>Right column</Text>
							<Text style={paragraph}>
								Also stacks on mobile so both cards remain readable.
							</Text>
						</Column>
					</Row>
				</Section>
				<Text className="hide-mobile" style={note}>
					Desktop-only note — hidden under 600px via @media.
				</Text>
			</Container>
		</Body>
	</Html>
);

export default ResponsiveTestEmail;

const main = {
	backgroundColor: "#f6f9fc",
	fontFamily:
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
	padding: "24px 0",
};

const container = {
	backgroundColor: "#ffffff",
	margin: "0 auto",
	padding: "24px",
	maxWidth: "600px",
};

const headlineStyle = {
	fontSize: "32px",
	fontWeight: "bold" as const,
	color: "#1a1a1a",
	margin: "0 0 12px",
};

const column = {
	width: "50%",
	verticalAlign: "top" as const,
	padding: "12px",
	backgroundColor: "#f1f5f9",
};

const cardTitle = {
	fontSize: "16px",
	fontWeight: "bold" as const,
	color: "#0f172a",
	margin: "0 0 8px",
};

const paragraph = {
	color: "#525f7f",
	fontSize: "15px",
	lineHeight: "22px",
};

const note = {
	color: "#94a3b8",
	fontSize: "13px",
	marginTop: "16px",
};
