"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./provider-list-panel.module.css";

type MetricLabel = "Compliance" | "Cost" | "Performance" | "Reliability";

type ProviderMetric = {
  label: MetricLabel;
  value: number;
};

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

const capabilityTags = ["GDPR", "ISO27001", "SOC2", "HIPAA", "PCI DSS", "CSA STAR"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

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

function deriveMetrics(provider: RankedProvider): ProviderMetric[] {
  const h = hashString(`${provider.name}-${provider.url}`);
  const variance = (shift: number, spread: number) => ((h >> shift) % spread) - Math.floor(spread / 2);

  return [
    { label: "Compliance", value: clamp(provider.score + 4 + variance(1, 9), 52, 99) },
    { label: "Cost", value: clamp(provider.score - 6 + variance(4, 11), 48, 96) },
    { label: "Performance", value: clamp(provider.score + variance(7, 9), 50, 98) },
    { label: "Reliability", value: clamp(provider.score + 2 + variance(10, 7), 52, 99) },
  ];
}

function deriveTags(provider: RankedProvider) {
  if (provider.tags?.length) return provider.tags;

  const h = hashString(provider.url + provider.name);
  const first = h % capabilityTags.length;
  const second = (first + 2) % capabilityTags.length;
  const third = (first + 4) % capabilityTags.length;
  return [capabilityTags[first], capabilityTags[second], capabilityTags[third]];
}

function warningLabel(warnings?: string[]) {
  if (!warnings?.length) return null;
  const budgetWarning = warnings.find((warning) => warning.toLowerCase().includes("budget"));
  if (budgetWarning) return "Budget warning";
  return warnings.length === 1 ? "Warning" : `${warnings.length} warnings`;
}

function metricExplanation(metric: ProviderMetric) {
  const tone = metric.value >= 78 ? "strong" : metric.value >= 62 ? "moderate" : "limited";
  return `${metric.label} signal is ${tone} based on the result score and supplier profile.`;
}

function CompanyResultCard({
  index,
  provider,
}: {
  index: number;
  provider: RankedProvider & {
    domain: string;
    logo: string;
    metrics: ProviderMetric[];
    tags: string[];
  };
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const visibleTags = provider.tags.slice(0, 4);
  const hiddenTagCount = Math.max(0, provider.tags.length - visibleTags.length);
  const warning = warningLabel(provider.warnings);
  const snippet = provider.snippet || provider.reasoning;
  const detailsId = `provider-details-${index}`;

  return (
    <article className={styles.card} data-expanded={expanded}>
      <button
        type="button"
        className={styles.cardButton}
        onClick={() => setExpanded((current) => !current)}
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
            <span className={styles.chevronWrap} aria-hidden="true">
              <ChevronRight className={styles.chevron} strokeWidth={2.2} />
            </span>
          </span>
        </span>

        <span className={styles.metricGrid}>
          {provider.metrics.map((metric) => (
            <span className={styles.metricPill} key={`${provider.url}-${metric.label}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}%</strong>
            </span>
          ))}
        </span>

        <span className={styles.tagRow}>
          <span className={styles.certGroup}>
            {visibleTags.map((tag) => (
              <span key={`${provider.url}-${tag}`} className={styles.tagChip}>
                {tag}
              </span>
            ))}
            {hiddenTagCount > 0 && (
              <span className={styles.tagChip}>+{hiddenTagCount}</span>
            )}
          </span>
          {warning && <span className={styles.warningChip}>{warning}</span>}
        </span>

        <span className={styles.snippet}>{snippet}</span>
      </button>

      <div className={styles.expandedPanel} id={detailsId} data-open={expanded}>
        <div className={styles.expandedContent}>
          <div className={styles.detailBlock}>
            <span className={styles.detailLabel}>Full preview</span>
            <p>{provider.reasoning}</p>
          </div>

          {provider.matchedFields?.length ? (
            <div className={styles.detailBlock}>
              <span className={styles.detailLabel}>Matched fields</span>
              <div className={styles.detailChipRow}>
                {provider.matchedFields.map((field) => (
                  <span key={`${provider.url}-${field}`} className={styles.detailChip}>
                    {field}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

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

          <div className={styles.detailBlock}>
            <span className={styles.detailLabel}>Metric signals</span>
            <div className={styles.metricDetailGrid}>
              {provider.metrics.map((metric) => (
                <span key={`${provider.url}-${metric.label}-detail`}>
                  <strong>{metric.label} {metric.value}%</strong>
                  {metricExplanation(metric)}
                </span>
              ))}
            </div>
          </div>

          <a
            className={styles.sourceLink}
            href={provider.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source
            <ExternalLink size={14} strokeWidth={2} />
          </a>
        </div>
      </div>
    </article>
  );
}

export function ProviderListPanel({ providers }: { providers: RankedProvider[] }) {
  const hydratedProviders = useMemo(
    () =>
      providers.map((provider) => ({
        ...provider,
        domain: getDomain(provider.url),
        logo: getInitials(provider.name),
        metrics: deriveMetrics(provider),
        tags: deriveTags(provider),
      })),
    [providers],
  );

  return (
    <section className={styles.panel} aria-label="Provider ranking list">
      <div className={styles.listWrap}>
        {hydratedProviders.map((provider, index) => (
          <CompanyResultCard
            key={`${provider.url}-${index}`}
            index={index}
            provider={provider}
          />
        ))}
      </div>
    </section>
  );
}
