"use client";

import { ChevronRight, ChevronUp, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./provider-list-panel.module.css";

export type RankedProvider = {
  name: string;
  url: string;
  score: number;
  reasoning: string;
  matchedFields?: string[];
  snippet?: string;
  tags?: string[];
  warnings?: string[];
};

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function warningLabel(warnings?: string[]) {
  if (!warnings?.length) return null;
  const budgetWarning = warnings.find((w) => w.toLowerCase().includes("budget"));
  if (budgetWarning) return "Budget warning";
  return warnings.length === 1 ? "Warning" : `${warnings.length} warnings`;
}

function CompanyResultCard({
  expanded,
  index,
  onSelect,
  onToggleExpand,
  provider,
  selectable,
  selected,
}: {
  expanded: boolean;
  index: number;
  onSelect?: () => void;
  onToggleExpand: () => void;
  provider: RankedProvider & { domain: string; logo: string };
  selectable?: boolean;
  selected?: boolean;
}) {
  const warning = warningLabel(provider.warnings);
  const snippet = provider.snippet || provider.reasoning;
  const detailsId = `provider-details-${index}`;
  const fields = provider.matchedFields ?? [];

  return (
    <article className={styles.card} data-expanded={expanded} data-selected={selected}>
      <button
        type="button"
        className={styles.cardButton}
        onClick={() => {
          if (selectable && !expanded) {
            onSelect?.()
          } else {
            onToggleExpand()
          }
        }}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <span className={styles.topRow}>
          <span className={styles.identityGroup}>
            <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.logoContainer} aria-hidden="true">
              <span className={styles.logoText}>{provider.logo}</span>
            </span>
            <span className={styles.providerText}>
              <span className={styles.providerName}>{provider.name}</span>
              <span className={styles.providerDomain}>{provider.domain}</span>
            </span>
          </span>

          <span className={styles.actionsGroup}>
            <span className={styles.scorePill}>
              <span className={styles.scoreValue}>{provider.score}</span>
              <span className={styles.scoreLabel}>match</span>
            </span>
            {selectable && (
              <span className={styles.selectionPill}>
                {selected ? "Selected" : "Select"}
              </span>
            )}
            <span className={styles.chevronWrap} aria-hidden="true">
              <ChevronRight className={styles.chevron} strokeWidth={2.2} />
            </span>
          </span>
        </span>

        {/* Matched procurement fields — real data from search */}
        {fields.length > 0 && (
          <span className={styles.metricGrid}>
            {fields.map((field) => (
              <span className={styles.metricPill} key={`${provider.url}-${field}`}>
                {field}
              </span>
            ))}
          </span>
        )}

        {warning && (
          <span className={styles.tagRow}>
            <span className={styles.certGroup} />
            <span className={styles.warningChip}>{warning}</span>
          </span>
        )}

        <span className={styles.snippet}>{snippet}</span>
      </button>

      <div className={styles.expandedPanel} id={detailsId} data-open={expanded}>
        <div className={styles.expandedContent}>
          <div className={styles.detailBlock}>
            <span className={styles.detailLabel}>Full preview</span>
            <p>{provider.reasoning}</p>
          </div>

          {fields.length > 0 && (
            <div className={styles.detailBlock}>
              <span className={styles.detailLabel}>Matched fields</span>
              <div className={styles.detailChipRow}>
                {fields.map((field) => (
                  <span key={`${provider.url}-${field}`} className={styles.detailChip}>
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {provider.warnings?.length ? (
            <div className={styles.detailBlock}>
              <span className={styles.detailLabel}>Warnings</span>
              <ul className={styles.warningList}>
                {provider.warnings.map((item) => (
                  <li key={`${provider.url}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={styles.expandedFooter}>
            <a
              className={styles.sourceLink}
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source
              <ExternalLink size={14} strokeWidth={2} />
            </a>
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              <ChevronUp size={13} strokeWidth={2.2} />
              Collapse
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProviderListPanel({
  defaultExpandedFirst = true,
  onSelect,
  providers,
  selectedIndex,
}: {
  defaultExpandedFirst?: boolean
  onSelect?: (provider: RankedProvider, index: number) => void
  providers: RankedProvider[]
  selectedIndex?: number | null
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    defaultExpandedFirst && providers.length > 0 ? 0 : null
  );

  const hydratedProviders = useMemo(
    () =>
      providers.map((provider) => ({
        ...provider,
        domain: getDomain(provider.url),
        logo: getInitials(provider.name),
      })),
    [providers],
  );

  return (
    <section className={styles.panel} aria-label="Provider ranking list">
      <div className={styles.listWrap}>
        {hydratedProviders.map((provider, index) => (
          <CompanyResultCard
            key={`${provider.url}-${index}`}
            expanded={expandedIndex === index}
            index={index}
            onSelect={() => {
              onSelect?.(provider, index)
              setExpandedIndex(index)
            }}
            onToggleExpand={() =>
              setExpandedIndex((prev) => (prev === index ? null : index))
            }
            provider={provider}
            selectable={Boolean(onSelect)}
            selected={selectedIndex === index}
          />
        ))}
      </div>
    </section>
  );
}
