"use client"

import { useMemo, useState } from "react"
import { Check, Copy, Download, Quote } from "lucide-react"
import type { ArticleDetail } from "@/src/features/journals"
import { recordCitationEvent } from "@/src/hooks/use-metric-events"
import {
  CITATION_FORMATS,
  citationToPlainText,
  generateCitation,
  type CitationFormat,
} from "@/src/features/journals/utils/citation-formatter"
import { sanitizeCitationHtml } from "@/src/features/journals/utils/sanitize-html"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CitationBoxProps {
  article: ArticleDetail
}

/**
 * Vancouver (ICMJE) is the medical / scientific journal convention and matches
 * the platform's primary audience. It remains the default regardless of
 * persisted user preference to keep behavior predictable across articles.
 */
const DEFAULT_FORMAT: CitationFormat = "vancouver"

export function CitationBox({ article }: CitationBoxProps) {
  const [format, setFormat] = useState<CitationFormat>(DEFAULT_FORMAT)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const activeFormat = useMemo(
    () => CITATION_FORMATS.find((f) => f.id === format) ?? CITATION_FORMATS[0],
    [format]
  )

  const citationHtml = useMemo(
    () => generateCitation(article, format, { htmlPreview: true }),
    [article, format]
  )
  const citationPlain = useMemo(() => citationToPlainText(citationHtml), [citationHtml])
  // Sanitize at the trust boundary (the sink), even though the formatter
  // already HTML-escapes every dynamic field: the preview only ever needs
  // the <i> emphasis the formatter emits, so allow nothing else.
  const citationHtmlSafe = useMemo(() => sanitizeCitationHtml(citationHtml), [citationHtml])

  const handleCopy = async () => {
    setCopyFailed(false)
    // Fire the citation metric before the clipboard call so a failed
    // clipboard write doesn't silently lose the engagement signal.
    recordCitationEvent({
      article_id: article.publicationId,
      journal_id: article.journalId,
      format,
      action: "copy",
    })
    const richHtml = activeFormat.display === "prose" ? citationHtml : ""
    try {
      if (typeof window !== "undefined" && "ClipboardItem" in window && richHtml) {
        const item = new ClipboardItem({
          "text/plain": new Blob([citationPlain], { type: "text/plain" }),
          "text/html": new Blob([richHtml], { type: "text/html" }),
        })
        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(citationPlain)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        await navigator.clipboard.writeText(citationPlain)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        setCopyFailed(true)
        setTimeout(() => setCopyFailed(false), 3000)
      }
    }
  }

  const handleExport = () => {
    if (!activeFormat.fileExtension) return
    recordCitationEvent({
      article_id: article.publicationId,
      journal_id: article.journalId,
      format,
      action: "export",
    })
    const body = generateCitation(article, format)
    const mime = activeFormat.fileExtension === "ris" ? "application/x-research-info-systems" : "text/plain"
    const blob = new Blob([body], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const year =
      article.year ||
      (article.datePublished ? new Date(article.datePublished).getFullYear() : "nd")
    const firstAuthor = (article.authors[0]?.familyName || "citation").replace(/\s+/g, "")
    const slug = `${firstAuthor}${year}`.replace(/[^a-zA-Z0-9_-]/g, "")

    const a = document.createElement("a")
    a.href = url
    a.download = `${slug || "citation"}.${activeFormat.fileExtension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <section
      aria-label="Cite this article"
      className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden"
    >
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border/50">
        <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Quote className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base leading-tight">Cite this article</h3>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
            {activeFormat.description}
          </p>
        </div>
        <Select value={format} onValueChange={(v) => setFormat(v as CitationFormat)}>
          <SelectTrigger
            size="sm"
            aria-label="Citation format"
            className="h-9 min-w-[150px] font-semibold"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="min-w-[220px]">
            {CITATION_FORMATS.map((fmt) => (
              <SelectItem key={fmt.id} value={fmt.id} className="py-2">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-semibold leading-none">{fmt.label}</span>
                  <span className="text-[11px] text-muted-foreground leading-none">
                    {fmt.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {/* Citation preview */}
      <div className="p-5 space-y-4">
        {activeFormat.display === "prose" ? (
          <div
            className="text-[13px] leading-relaxed text-foreground/90 rounded-lg bg-muted/30 p-4 border border-border/40 [&_i]:italic break-words"
            dangerouslySetInnerHTML={{ __html: citationHtmlSafe }}
          />
        ) : (
          <pre className="text-[12px] leading-relaxed text-foreground/90 rounded-lg bg-muted/40 p-4 border border-border/40 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
            {citationPlain}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-live="polite"
            className={[
              "flex-1 min-w-[140px] gap-2 transition-colors",
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
                : "bg-transparent hover:bg-muted/50",
            ].join(" ")}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : copyFailed ? "Copy failed" : "Copy citation"}
          </Button>
          {activeFormat.fileExtension && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              title={`Download .${activeFormat.fileExtension}`}
              className="gap-2 bg-transparent hover:bg-muted/50"
            >
              <Download className="h-4 w-4" />
              .{activeFormat.fileExtension}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
