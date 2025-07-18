import fs from "node:fs";
import z from "zod";

const booleanString = () =>
	z
		.enum(["true", "false"])
		.transform((val) => val === "true")
		.pipe(z.boolean());

// config fields that can come from env, evn vars are always strings
const envConfigSchema = z
	.object({
		UI_HTTPS: booleanString(),
		UI_HOST: z.string(),
		UI_PORT: z.coerce.number(),
		UI_PATH: z.string(),
		BRIDGE_LOCATE_URL: z.string().url(),
		BRIDGE_SOCKET_PORT: z.coerce.number(),
		BRIDGE_FILES_PORT: z.coerce.number().positive().int(),
		ANALYTICS_CODE: z.array(z.string()),
	})
	.partial();

// final config schema, with default values and strict types
const fullConfigSchema = z.object({
	name: z.string().default("PHNTM BRIDGE WEB UI"),
	https: z.boolean().default(false),
	ssl: z.object({ private: z.string(), public: z.string() }).optional(),
	port: z.number().positive().int(),
	host: z.string().default("unknown"),
	path: z.string().default("/"),
	bridgeLocateUrl: z.string().url(),
	bridgeSocketPort: z.number().positive().int().default(1337),
	bridgeFilesPort: z.number().positive().int().default(1338),
	analyticsCode: z.array(z.string()).default([]),
});

export async function getConfig() {
	let configFname = process.env.CONFIG_FILE ?? `${__dirname}/../config.jsonc`;
	let fileConfig: unknown = {};
	if (fs.existsSync(configFname)) {
		console.log("Loading config from " + configFname);
		fileConfig = await import(configFname);
	}

	const env = envConfigSchema.parse(process.env);
	const envConfigRenamed = {
		...(env.UI_HTTPS !== undefined && { https: env.UI_HTTPS }),
		...(env.UI_HOST !== undefined && { host: env.UI_HOST }),
		...(env.UI_PORT !== undefined && { port: env.UI_PORT }),
		...(env.UI_PATH !== undefined && { path: env.UI_PATH }),
		...(env.BRIDGE_LOCATE_URL !== undefined && {
			bridgeLocateUrl: env.BRIDGE_LOCATE_URL,
		}),
		...(env.BRIDGE_SOCKET_PORT !== undefined && {
			bridgeSocketPort: env.BRIDGE_SOCKET_PORT,
		}),
		...(env.BRIDGE_FILES_PORT !== undefined && {
			bridgeFilesPort: env.BRIDGE_FILES_PORT,
		}),
		...(env.ANALYTICS_CODE !== undefined && {
			analyticsCode: env.ANALYTICS_CODE,
		}),
	};

	return fullConfigSchema.parse(Object.assign({}, fileConfig, envConfigRenamed));
}

export type BridgeUiConfig = Awaited<ReturnType<typeof getConfig>>;
