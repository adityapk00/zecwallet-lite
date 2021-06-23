import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders title", () => {
  render(<App />);
  const title = screen.getByText(
    /Built using CRA electron-builder-typescript Template/i
  );
  expect(title).toBeInTheDocument();
});
