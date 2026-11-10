// For this package's own typecheck. Consumers bring their own declaration (Next: next-env.d.ts, collector: share/).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
