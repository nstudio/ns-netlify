/// <reference path="./node_modules/@nativescript/types/index.d.ts" />
/// <reference path="./node_modules/@nativescript/types-ios/lib/ios/objc-x86_64/objc!CoreLocation.d.ts" />
/// <reference path="./node_modules/@nativescript/types-ios/lib/ios/objc-x86_64/objc!_LocationEssentials.d.ts" />
/// <reference path="./node_modules/@nativescript/types-ios/lib/ios/objc-x86_64/objc!Vision.d.ts" />

declare module 'ns-edge-jsx' {
  import type { NSComponentsMap, NSCustomComponentsMap } from 'dominative';
  type Components = NSComponentsMap & NSCustomComponentsMap;
  type Settable<T> = {
    [K in keyof T as K extends `_${string}` ? never : T[K] extends (...args: any[]) => any ? never : K]?: T[K] | string;
  };
  export type NativeProps<T> = Settable<T> & {
    className?: string;
    class?: string;
    style?: string | Record<string, unknown>;
    row?: number | string;
    col?: number | string;
    rowSpan?: number | string;
    colSpan?: number | string;
    children?: unknown;
    [attribute: string]: unknown;
  };
  export type NativeElements = { [K in keyof Components as Lowercase<K & string>]: NativeProps<Components[K]> };
}

declare module 'ns-edge-jsx/react/jsx-runtime' {
  import type { JSX as ReactJSX, JSXElementConstructor } from 'react';
  import type { NativeElements } from 'ns-edge-jsx';
  export { Fragment, jsx, jsxs } from 'react/jsx-runtime';
  export namespace JSX {
    type ElementType = string | JSXElementConstructor<any>;
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
    // Interfaces, as in React's own JSX namespace: declared as aliases, a ref on a class component (View) doesn't typecheck.
    interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends ReactJSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends NativeElements {}
  }
}
