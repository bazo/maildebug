import { parseArgs } from "util";

import {
	allowedTemplateNames,
	isTemplateName,
	renderTemplate,
	sendEmail,
	smtpConfigFromEnv,
} from "./templates";

const { values } = parseArgs({
	args: Bun.argv.splice(2),
	options: {
		email: {
			type: "string",
		},
	},
	strict: true,
	allowPositionals: false,
});

if (!values.email) {
	console.error("no template given");
	process.exit(1);
}

if (!isTemplateName(values.email)) {
	console.error(
		`Invalid template given: ${values.email}, allowed: ${allowedTemplateNames.join(", ")}`,
	);
	process.exit(2);
}

const html = await renderTemplate(values.email);

const res = await sendEmail({
	config: smtpConfigFromEnv(),
	from: "you@example.com",
	to: "user@gmail.com",
	subject: "hello world",
	html,
});

console.log(res);
