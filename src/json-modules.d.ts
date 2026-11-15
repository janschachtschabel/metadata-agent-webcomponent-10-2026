/**
 * JSON files of the project as modules; webpack bundles them. The widget's
 * own texts are built in this way (core/dynamic-translate-loader.ts, audit
 * 14.11., U-04), and specs read angular.json and the agent's schema files.
 */
declare module '*.json' {
  const value: any;
  export default value;
}

/**
 * A template as text, the way Angular's build reads component resources
 * (icons.spec.ts looks through every template for icon names).
 */
declare module '*.html?ngResource' {
  const text: string;
  export default text;
}
