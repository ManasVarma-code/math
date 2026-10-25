import Plot from "react-plotly.js";
import type { Config, Data, Layout } from "plotly.js";

type PlotlyChartProps = {
  data: Data[];
  xTitle: string;
  yTitle: string;
  showGrid?: boolean;
  height?: number;
  title?: string;
  legend?: boolean;
};

export default function PlotlyChart({
  data,
  xTitle,
  yTitle,
  showGrid = true,
  height = 340,
  title,
  legend = true,
}: PlotlyChartProps) {
  const layout: Partial<Layout> = {
    autosize: true,
    height,
    title: title ? { text: title, font: { size: 14, color: "#d8e3ef" } } : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "DM Sans, sans-serif", color: "#9aa9ba", size: 11 },
    margin: { l: 54, r: 20, t: title ? 44 : 24, b: 52 },
    showlegend: legend,
    legend: { orientation: "h", x: 0, y: 1.13, font: { size: 11 } },
    hovermode: "closest",
    xaxis: {
      title: { text: xTitle, font: { size: 12 } },
      showgrid: showGrid,
      gridcolor: "rgba(135,157,181,.12)",
      zerolinecolor: "rgba(135,157,181,.2)",
      linecolor: "rgba(135,157,181,.25)",
    },
    yaxis: {
      title: { text: yTitle, font: { size: 12 } },
      showgrid: showGrid,
      gridcolor: "rgba(135,157,181,.12)",
      zerolinecolor: "rgba(135,157,181,.2)",
      linecolor: "rgba(135,157,181,.25)",
    },
    uirevision: `${xTitle}-${yTitle}`,
  };
  const config: Partial<Config> = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    toImageButtonOptions: {
      format: "png",
      filename: "equationpath-plot",
      width: 1400,
      height: 800,
      scale: 2,
    },
    modeBarButtonsToRemove: ["select2d", "lasso2d"],
  };

  return (
    <Plot
      data={data}
      layout={layout}
      config={config}
      useResizeHandler
      style={{ width: "100%", height }}
    />
  );
}
