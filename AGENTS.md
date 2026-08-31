# Repository Guidelines

## Project Structure & Module Organization

Firefly is an Astro 7 site with Svelte islands and TypeScript configuration. Main source code lives in `src/`: routes in `src/pages`, layouts in `src/layouts`, reusable UI in `src/components`, styles in `src/styles`, content in `src/content`, helpers in `src/utils`, and Markdown/HTML plugins in `src/plugins`. Site configuration is split across `src/config` with matching type definitions in `src/types`; prefer imports from `@/config` when available. Static files served directly belong in `public`, source-managed images in `src/assets`, docs in `docs` and `Firefly-Docs`, and automation in `scripts`.

## Build, Test, and Development Commands

Use `pnpm`; the `preinstall` script enforces it.

- `pnpm dev` or `pnpm start`: run the local Astro dev server.
- `pnpm check`: run Astro diagnostics.
- `pnpm type-check`: run TypeScript with `--noEmit`.
- `pnpm format`: format `src` with Biome.
- `pnpm lint`: run Biome checks and safe fixes on `src`.
- `pnpm build`: generate icons, LQIPs, the Astro build, font subsets, and Pagefind search output in `dist`.
- `pnpm preview`: preview the production build locally.
- `pnpm new-post`: scaffold a new content post.

## Coding Style & Naming Conventions

Biome is the formatter and linter. It uses tabs for indentation and double quotes for JavaScript/TypeScript strings. Keep Astro and Svelte components in `PascalCase` (`PostCard.astro`, `Search.svelte`), config modules in `camelCase` ending with `Config.ts`, and utilities in descriptive kebab case such as `date-utils.ts`. Keep `src/types` aligned with `src/config`. Avoid unrelated formatting churn.

## Testing Guidelines

There is no dedicated unit-test framework configured. Before submitting changes, run `pnpm check`, `pnpm type-check`, and `pnpm build` for rendering, content, or generated asset work. For visual or interactive changes, verify with `pnpm dev` or `pnpm preview` and include screenshots in the PR. Name future tests near the feature they cover, using the local file name as the stem.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching the current history: `feat: ...`, `fix: ...`, and `chore: ...`. Keep commits and PRs focused on one concern. PRs should include a concise summary, linked issues when relevant, validation commands run, and screenshots for UI changes. Discuss major features or design changes in an issue or discussion before implementation.

## Security & Configuration Tips

Do not commit secrets, tokens, or service keys in config files. Keep deployment-specific settings in the target platform environment, and review generated files such as `dist`, `src/constants/lqips.json`, and `src/constants/icons.ts` before committing them.

## 上游同步与冲突处理规则

- `origin` 指向个人 Fork，`upstream` 指向 `CuteLeaf/Firefly`；普通 `git pull` 只同步 `origin`。同步官方更新时使用 `git fetch upstream`，确认提交范围后再将 `upstream/master` 合并到当前分支。
- 合并前必须确认工作区干净，并记录当前分支和远端跟踪关系。合并后只向 `origin` 推送，不向 `upstream` 推送。
- 冲突处理遵循“上游结构、本地配置”原则：框架重构、依赖版本、构建脚本和公共组件优先采用上游实现；站点品牌、域名、内容、壁纸、自定义资源及用户明确增加的功能优先保留本地实现。
- 遇到上游字段迁移或组件拆分时，将本地行为迁移到新接口，不保留已经废弃的字段或整段旧实现。例如显示设置统一写入 `displaySettingsConfig`，不再把 `switchable` 分散在各功能配置中。
- 不对所有冲突文件统一使用 `ours` 或 `theirs`。文本文件逐段比较共同基线、本地版本和上游版本；本地已删除且未被配置引用的示例资源继续保持删除。
- `src/constants/lqips.json` 等生成文件不手工拼接冲突内容，应在资源取舍完成后运行对应生成脚本重新生成。
- 解决冲突后检查是否仍有冲突标记和未合并文件，并至少运行 `pnpm check`、`pnpm type-check` 与 `pnpm build`。只有验证通过后才能提交合并结果。
- Git 提交说明和 PR 默认使用简体中文；新增功能若当前位于主分支，先创建 `codex/` 前缀的功能分支。
