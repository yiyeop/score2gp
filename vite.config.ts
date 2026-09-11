import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { alphaTab } from "@coderline/alphatab-vite";
// @ts-expect-error node 타입(@types/node)을 두지 않아 선언이 없다. 실행은 Node라 된다.
import { rmSync } from "node:fs";

/**
 * 앱이 쓰지 않는 사운드폰트를 빌드 결과에서 뺀다.
 *
 * alphaTab 플러그인은 빌드할 때마다 패키지의 font/·soundfont/ 폴더를 통째로
 * public/에 복사한다. 앱은 sonivox.sf3만 읽는데(src/player/useAlphaTab.ts)
 * 같은 폴더의 sonivox.sf2(1.3MB)까지 번들에 실린다. 플러그인에는 파일을 골라
 * 빼는 옵션이 없어서(assetOutputDir: false 는 복사 자체를 끈다), 복사와 쓰기가
 * 모두 끝난 뒤 결과물에서 지운다.
 */
function dropUnusedSoundFont(): Plugin {
  let target = "";
  return {
    name: "score2gp:drop-unused-soundfont",
    apply: "build",
    configResolved(config) {
      const out = config.build.outDir;
      const outDir = /^([A-Za-z]:)?[\\/]/.test(out) ? out : `${config.root}/${out}`;
      target = `${outDir}/soundfont/sonivox.sf2`;
    },
    closeBundle() {
      rmSync(target, { force: true });
    },
  };
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), alphaTab(), dropUnusedSoundFont()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
