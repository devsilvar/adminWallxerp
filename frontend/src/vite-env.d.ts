/// <reference types="vite/client" />

// `.jfif` is a JPEG variant Vite serves as an asset, but it isn't in
// vite/client's built-in module declarations — declare it here so TS
// resolves `import x from './foo.jfif'` to a URL string.
declare module '*.jfif' {
  const src: string;
  export default src;
}
