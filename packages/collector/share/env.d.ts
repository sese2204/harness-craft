// Ambient declarations for the share bundle (esbuild: CSS Modules via `local-css`, plain CSS as global styles).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.css';
