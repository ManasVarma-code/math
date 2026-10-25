import { test, expect } from "@playwright/test";

test("browser-only engine computes exactness, factors, IVP, contours, metrics and general fitting without API calls", async ({
  page,
}) => {
  const forbidden: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== "http://127.0.0.1:5173" ||
      url.pathname.startsWith("/api/")
    ) {
      forbidden.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/solver");
  const post = async (path: string, data: unknown) =>
    page.evaluate(
      async ({ path, data }) => {
        // @ts-expect-error Vite serves this source module for the test harness.
        const { runMathOperation } = await import("/src/lib/browser-math.ts");
        return runMathOperation(`/api/${path}`, data);
      },
      { path, data },
    );
  const exact = await post("equations/check", { m: "2*x*y+3", n: "x^2+4*y" });
  expect(exact.is_exact).toBe(true);
  expect(exact.m_y).toBe("2*x");
  expect(exact.n_x).toBe("2*x");
  const solved = await post("equations/solve", { m: "2*x*y+3", n: "x**2+4*y" });
  expect(solved.implicit_solution).toBe("x**2*y + 3*x + 2*y**2 = C");
  expect(solved.verification.F_x_equals_M).toBe(true);
  const factor = await post("equations/solve", { m: "y**2", n: "x*y" });
  expect(factor.method).toBe("integrating_factor_y");
  expect(factor.domain_restrictions).toContain("y != 0");
  const curve = await post("equations/plot", {
    m: "y",
    n: "1",
    x0: 0,
    y0: 1,
    x_min: 0,
    x_max: 1,
  });
  expect(Math.abs(curve.y.at(-1) - Math.exp(-1))).toBeLessThan(1e-6);
  const contour = await post("equations/contour", {
    m: "2*x",
    n: "2*y",
    x0: 1,
    y0: 0,
    x_min: -2,
    x_max: 2,
    y_min: -2,
    y_max: 2,
    resolution: 40,
  });
  expect(contour.level).toBe(1);
  expect(contour.z[0][0]).toBe(8);
  const observations = [-1, -0.5, 0, 0.5, 1].map((x) => ({
    x_value: x,
    observed_y: 3 * Math.exp(x) - x - 1,
  }));
  const fit = await post("data/fit-ode", {
    m: "-x-y",
    n: "1",
    x0: 0,
    initial_guess: 1,
    observations,
  });
  expect(Math.abs(fit.parameter_value - 2)).toBeLessThan(1e-5);
  expect(fit.metrics.rmse).toBeLessThan(1e-6);
  const r2 = await post("data/analyze", {
    model: "quadratic",
    observations: [0, 1, 2].map((x) => ({ x_value: x, observed_y: 4 })),
  });
  expect(r2.metrics.r_squared).toBeNull();
  expect(forbidden).toEqual([]);
});

test("browser engine rejects malformed expressions, singular paths and invalid request bodies", async ({
  page,
}) => {
  await page.goto("/solver");
  for (const [path, data] of [
    ["equations/solve", { m: "__import__('os')", n: "1" }],
    ["equations/plot", { m: "1", n: "x", x0: -1, y0: 1, x_min: -1, x_max: 1 }],
    [
      "data/fit-ode",
      { m: "y", n: "1", observations: [{ x_value: 0, observed_y: "bad" }] },
    ],
    ["equations/contour", { m: "x+y", n: "1+x*y", x0: 1, y0: 1 }],
  ] as const) {
    const error = await page.evaluate(
      async ({ path, data }) => {
        // @ts-expect-error Vite source module for the test harness.
        const { runMathOperation } = await import("/src/lib/browser-math.ts");
        try {
          await runMathOperation(`/api/${path}`, data);
          return null;
        } catch (e) {
          return String(e);
        }
      },
      { path, data },
    );
    expect(error).toBeTruthy();
  }
});

test("solver renders genuine results, invalidates edits, exports and transfers to both modules", async ({
  page,
}) => {
  await page.goto("/solver");
  await page.getByTestId("input-equation-m").fill("y");
  await page.getByTestId("input-equation-n").fill("x");
  await page
    .getByRole("button", { name: "Check exactness", exact: true })
    .click();
  await expect(page.getByText("Exact equation", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Solve equation", exact: true })
    .click();
  await expect(
    page.getByText("IMPLICIT SOLUTION", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".potential-result .katex-html").first(),
  ).toContainText("xy");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export solution" }).click();
  expect((await download).suggestedFilename()).toBe(
    "equationpath-solution.json",
  );
  await page.getByLabel("Transfer x₀").fill("1");
  await page.getByLabel("Transfer y₀").fill("2");
  await page.getByRole("link", { name: "Visualize this equation" }).click();
  await expect(
    page.getByRole("textbox", { name: "M(x, y)", exact: true }),
  ).toHaveValue("y");
  await expect(page.getByLabel("y₀", { exact: true })).toHaveValue("2");
  await page
    .getByRole("link", { name: "Exactness solver", exact: true })
    .click();
  await page.getByRole("link", { name: "Compare with observations" }).click();
  await expect(
    page.getByRole("textbox", { name: "N(x, y)", exact: true }),
  ).toHaveValue("x");
  await expect(page.getByLabel("Reference x₀")).toHaveValue("1");
  await page
    .getByRole("link", { name: "Exactness solver", exact: true })
    .click();
  await page.getByTestId("input-equation-m").fill("x");
  await expect(
    page.getByText("IMPLICIT SOLUTION", { exact: true }),
  ).toBeHidden();
});

test("CSV cases, analytic sample fitting, all plots, exports and general ODE transfer fit", async ({
  page,
}) => {
  await page.goto("/fitting");
  await page.getByLabel("Sample dataset").selectOption("0");
  await page.getByRole("button", { name: "Analyze observations" }).click();
  await expect(
    page.getByRole("heading", { name: "Fit summary", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".js-plotly-plot")).toHaveCount(4);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("fit-results.csv");
  await page
    .getByTestId("input-csv-upload")
    .setInputFiles({
      name: "cases.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "observed_y,case_id,x_value\n2,A,0\n1.213061319,A,0.5\n0.735758882,A,1\n3,B,0\n1.819591979,B,0.5\n1.103638324,B,1",
      ),
    });
  await page.getByLabel("Case ID", { exact: true }).selectOption("B");
  await expect(page.getByText("Fit summary", { exact: true })).toBeHidden();
  await page
    .getByRole("button", { name: "Fit entered ODE", exact: true })
    .click();
  await page.getByRole("button", { name: "Analyze observations" }).click();
  await expect(page.locator(".fit-parameter strong")).toContainText("3");
  await page
    .getByTestId("input-csv-upload")
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("x,y\n1,2"),
    });
  await expect(page.getByRole("alert")).toContainText("Missing required");
  await expect(page.getByLabel("Case ID", { exact: true })).toHaveValue("B");
});

test("numerical and implicit graphs use real API data and show failures", async ({
  page,
}) => {
  await page.goto("/visualizer");
  await page.getByRole("button", { name: "Compute solution curve" }).click();
  await expect(page.locator(".js-plotly-plot")).toBeVisible();
  await page
    .getByRole("button", { name: "Implicit contour", exact: true })
    .click();
  await page.getByLabel("M(x, y)", { exact: true }).fill("2*x");
  await page.getByLabel("N(x, y)", { exact: true }).fill("2*y");
  await page.getByLabel("x₀", { exact: true }).fill("1");
  await page.getByLabel("y₀", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Compute solution curve" }).click();
  await expect(page.locator(".js-plotly-plot")).toBeVisible();
  await expect(
    page.getByText("Finite-mesh contour", { exact: false }),
  ).toBeVisible();
  const image = page.waitForEvent("download");
  await page.locator(".js-plotly-plot").hover();
  await page.locator('.modebar-btn[data-title*="Download"]').click();
  expect((await image).suggestedFilename()).toMatch(/\.png$/);
  await page
    .getByRole("button", { name: "Numerical IVP", exact: true })
    .click();
  await page.getByLabel("N(x, y)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Compute solution curve" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("complete Unit IV to Unit V workflow fits the actual solved ODE", async ({
  page,
}) => {
  await page.goto("/solver");
  await page.getByTestId("input-equation-m").fill("-x-y");
  await page.getByTestId("input-equation-n").fill("1");
  await page
    .getByRole("button", { name: "Solve equation", exact: true })
    .click();
  await expect(
    page.getByText("IMPLICIT SOLUTION", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Compare with observations" }).click();
  await expect(
    page.getByRole("textbox", { name: "M(x, y)", exact: true }),
  ).toHaveValue("-x-y");
  const csv = [
    "case_id,x_value,observed_y",
    ...[-1, -0.5, 0, 0.5, 1].map(
      (x) => `experiment,${x},${3 * Math.exp(x) - x - 1}`,
    ),
  ].join("\n");
  await page
    .getByTestId("input-csv-upload")
    .setInputFiles({
      name: "actual-ode.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page.getByRole("button", { name: "Analyze observations" }).click();
  await expect(page.locator(".fit-parameter strong")).toHaveText("2");
  await expect(
    page.getByRole("heading", { name: "Residuals vs x", exact: true }),
  ).toBeVisible();
});

for (const width of [375, 768, 1366, 1920])
  test(`responsive pages at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/solver",
      "/visualizer",
      "/fitting",
      "/examples",
      "/guide",
      "/history",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      if (route === "/solver") {
        await page
          .getByRole("button", { name: "Solve equation", exact: true })
          .click();
        await expect(
          page.getByText("IMPLICIT SOLUTION", { exact: true }),
        ).toBeVisible();
      }
      if (route === "/visualizer") {
        await page
          .getByRole("button", { name: "Compute solution curve" })
          .click();
        await expect(page.locator(".js-plotly-plot")).toBeVisible();
      }
      if (route === "/fitting") {
        await page.getByLabel("Sample dataset").selectOption("0");
        await page
          .getByRole("button", { name: "Analyze observations" })
          .click();
        await expect(
          page.getByRole("heading", { name: "Fit summary", exact: true }),
        ).toBeVisible();
      }
      if (route === "/examples")
        await expect(
          page.getByRole("heading", { name: "Exact polynomial", exact: true }),
        ).toBeVisible();
      if (width === 375) {
        await page.getByRole("button", { name: "Toggle navigation" }).click();
        await expect(
          page.getByRole("link", { name: "Learning guide", exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Close navigation" }).click();
      }
      const sizes = await page.evaluate(() => ({
        body: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(sizes.body).toBeLessThanOrEqual(sizes.viewport + 1);
      await page.screenshot({
        path: testInfo.outputPath(
          `${route.slice(1) || "overview"}-${width}.png`,
        ),
        fullPage: true,
      });
    }
  });
