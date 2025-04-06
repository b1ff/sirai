## Code Guidelines

1. Generate strict typescript. Do not use implicit `any` types. Avoid explicit `any` types unless absolutely necessary.
2. You MUST run `npm run build` after any changes .ts and .tsx files to validate and fix compilation issues if any.
3. SKIP any comments, no content in `//` or `/* */` should be generated.
4. Errors reporting should be transparent, no need to hide error details.
5. Avoid long methods, functions, and classes. If a method is too long, break it into smaller methods.
