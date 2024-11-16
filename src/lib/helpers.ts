import { Debugger } from "./debugger";
const $d:Debugger = Debugger.Get();
import * as fs from 'fs';
import * as path from 'path';

export function GetCerts (priv: string, pub: string) : string[] {
    let certFiles : string[] = [priv, pub];
    const fs = require('fs');
    for (var i = 0; i < 2; i++) {
        if (!fs.existsSync(certFiles[i])) {
            $d.log((certFiles[i]+" not found. Run `sh ./ssl/gen.sh` to generate a self signed SSL certificate").red);
            break;
        }
    }
    return certFiles;
}

export function UncaughtExceptionHandler (err: any, dieOnException:boolean) : void {

    //const $t = $s.$t;

    //console.log(srv);
    $d.log("[EXCEPTION]".bgRed);
    $d.log(err);

    $d.log(err.stack);
    if (err && err.code && typeof err.code === 'string' && err.code.indexOf('EADDRINUSE') !== -1) Die("Port busy");
    if (dieOnException) {
        Die();
    }
}

export function Die (message?: string) : void{
    var m = "Kthxbye!";
    if (message) m += " [" + message + "]";
    $d.log(m.bgRed);
    process.exit(1);
}

export function GetGitInfo(repoPath: string = '.') : string[] {
    const gitPath: string = path.join(repoPath, '.git');
    let currentSHA: string | null = null;
    let latestTag: string | null = null;
  
    // Read HEAD to get current SHA
    try {
      const headContent: string = fs.readFileSync(path.join(gitPath, 'HEAD'), 'utf8').trim();
      if (headContent.startsWith('ref: ')) {
        const ref: string = headContent.slice(5);
        currentSHA = fs.readFileSync(path.join(gitPath, ref), 'utf8').trim();
      } else {
        currentSHA = headContent;
      }
    } catch (error) {
      $d.err('Error reading current git SHA:', (error as Error).message);
    }
  
    // Read packed-refs file
    const packedRefsPath: string = path.join(gitPath, 'packed-refs');
    if (fs.existsSync(packedRefsPath)) {
      const packedRefs: string = fs.readFileSync(packedRefsPath, 'utf8');
      const lines: string[] = packedRefs.split('\n');

      // Find the latest tag that points to the current SHA
      for (const line of lines) {
        if (line.includes(currentSHA) && line.includes('refs/tags/')) {
          latestTag = line.split('refs/tags/')[1];
          break;
        }
      }
    }

    // If not found in packed-refs, check loose refs
    if (!latestTag) {
      const tagsPath: string = path.join(gitPath, 'refs', 'tags');
      if (fs.existsSync(tagsPath)) {
        const tags: string[] = fs.readdirSync(tagsPath);
        for (const tag of tags) {
          const tagSHA: string = fs.readFileSync(path.join(tagsPath, tag), 'utf8').trim();
          if (tagSHA === currentSHA) {
            latestTag = tag;
            break;
          }
        }
      }
    }
  
    return [ currentSHA, latestTag ];
  }

