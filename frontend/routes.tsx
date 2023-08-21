import { BasicForm } from "Frontend/views/BasicForm.js";
import MainLayout from "Frontend/views/MainLayout.js";
import { lazy } from "react";
import {
    createBrowserRouter,
    IndexRouteObject,
    NonIndexRouteObject,
    useMatches,
} from "react-router-dom";
import NestedModelForm from "./views/NestedModelForm";

const CrossFieldValidation = lazy(
  async () => import("Frontend/views/CrossFieldValidationForm.js")
);
export type MenuProps = Readonly<{
  icon?: string;
  title?: string;
}>;

export type ViewMeta = Readonly<{ handle?: MenuProps }>;

type Override<T, E> = Omit<T, keyof E> & E;

export type IndexViewRouteObject = Override<IndexRouteObject, ViewMeta>;
export type NonIndexViewRouteObject = Override<
  Override<NonIndexRouteObject, ViewMeta>,
  {
    children?: ViewRouteObject[];
  }
>;
export type ViewRouteObject = IndexViewRouteObject | NonIndexViewRouteObject;

type RouteMatch = ReturnType<typeof useMatches> extends (infer T)[] ? T : never;

export type ViewRouteMatch = Readonly<Override<RouteMatch, ViewMeta>>;

export const useViewMatches = useMatches as () => readonly ViewRouteMatch[];

export const routes: readonly ViewRouteObject[] = [
  {
    element: <MainLayout />,
    handle: { icon: "null", title: "Main" },
    children: [
      {
        path: "/",
        element: <BasicForm />,
        handle: { icon: "globe-solid", title: "Basic Form" },
      },
      {
        path: "/crossfield",
        element: <CrossFieldValidation />,
        handle: { icon: "file", title: "Cross field validation" },
      },
      {
        path: "/nested",
        element: <NestedModelForm />,
        handle: { icon: "file", title: "Nested bean" },
      },
    ],
  },
];

const router = createBrowserRouter([...routes]);
export default router;
