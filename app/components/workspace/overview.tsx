import { useEffect, useState, type ReactNode } from "react";
import type { Snapshot } from "~/domain/finance";
import type { Open } from "./types";
import { BalanceFocus, type BalanceView } from "./balance-focus";
import { MarketBrief } from "./market-brief";
import { NewsCarousel } from "./news-carousel";
import { FxRibbon } from "./fx-ribbon";
import { PendingOverview, RecentOverview } from "./overview-lists";
import type { QuoteSeries } from "~/domain/quotes";

export function Overview({
  snapshot,
  paymentNotice,
  base,
  open,
  view,
  onView,
  cadence,
  onCadence,
  preview,
  dollar,
  onDollar,
}: {
  snapshot: Snapshot;
  paymentNotice?: ReactNode;
  base: string;
  open: Open;
  view: BalanceView;
  onView: (view: BalanceView) => void;
  cadence: "daily" | "weekly";
  onCadence: (value: "daily" | "weekly") => void;
  preview: boolean;
  dollar: QuoteSeries;
  onDollar: (series: QuoteSeries) => void;
}) {
  const [visibleView, setVisibleView] = useState(view);
  const [visibleCadence, setVisibleCadence] = useState(cadence);
  const [visibleDollar, setVisibleDollar] = useState(dollar);
  useEffect(() => setVisibleView(view), [view]);
  useEffect(() => setVisibleCadence(cadence), [cadence]);
  useEffect(() => setVisibleDollar(dollar), [dollar]);

  return (
    <div className="overview-composition">
      <div className="overview-top-grid">
        <BalanceFocus
          snapshot={snapshot}
          view={visibleView}
          onView={(value) => {
            setVisibleView(value);
            onView(value);
          }}
          base={base}
        />
        <MarketBrief
          favorites={snapshot.favorites}
          base={base}
          companies={snapshot.markets?.companies}
        />
      </div>
      {paymentNotice}
      <FxRibbon
        snapshot={snapshot}
        base={base}
        preview={preview}
        dollar={visibleDollar}
        onDollar={(value) => {
          setVisibleDollar(value);
          onDollar(value);
        }}
      />
      <div className="overview-editorial-grid">
        <NewsCarousel
          snapshot={snapshot}
          base={base}
          cadence={visibleCadence}
          onCadence={(value) => {
            setVisibleCadence(value);
            onCadence(value);
          }}
        />
        <PendingOverview snapshot={snapshot} base={base} open={open} />
      </div>
      <RecentOverview snapshot={snapshot} base={base} open={open} />
    </div>
  );
}
