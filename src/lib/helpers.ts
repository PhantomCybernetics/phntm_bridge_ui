import { Debugger } from "./debugger";
import { execSync } from 'child_process';

const $d: Debugger = Debugger.Get();

export function GetCerts(priv: string, pub: string): string[] {
	let certFiles: string[] = [priv, pub];
	const fs = require("fs");
	for (var i = 0; i < 2; i++) {
		if (!fs.existsSync(certFiles[i])) {
			$d.log(
				(
					certFiles[i] +
					" not found. Run `sh ./ssl/gen.sh` to generate a self signed SSL certificate"
				).red,
			);
			break;
		}
	}
	return certFiles;
}

export function UncaughtExceptionHandler(err: any, dieOnException: boolean): void {
	//const $t = $s.$t;

	//console.log(srv);
	$d.log("[EXCEPTION]".bgRed);
	$d.log(err);

	$d.log(err.stack);
	if (
		err &&
		err.code &&
		typeof err.code === "string" &&
		err.code.indexOf("EADDRINUSE") !== -1
	)
		Die("Port busy");
	if (dieOnException) {
		Die();
	}
}

export function Die(message?: string): void {
	var m = "Kthxbye!";
	if (message) m += " [" + message + "]";
	$d.log(m.bgRed);
	process.exit(1);
}

export function GetGitCommitHash(): string|null {
  try {
    const hash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    return hash;
  } catch (error) {
    return null;
  }
}

export function GetExactTagOnHead(): string|null {
  try {
    const tag = execSync('git describe --exact-match --tags --abbrev=0', { encoding: 'utf8' }).trim();
    return tag;
  } catch (error) {
    return null;  // no exact tag on HEAD
  }
}

