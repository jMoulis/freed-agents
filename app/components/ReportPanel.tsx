"use client";

import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ─── Markdown component map ───────────────────────────────────────────────────

const md: Components = {
  h1: ({ children }) => (
    <h1 className="font-mono text-[22px] font-bold text-white tracking-tight mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-mono text-[10px] font-bold tracking-[0.14em] uppercase text-[#7c7c9a] mt-8 mb-3 pb-2 border-b border-[#1e1e2e]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a0a0c0] mt-5 mb-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[13px] font-semibold text-[#c0c0e0] mt-4 mb-1.5">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-[14px] text-[#c0c0d8] leading-relaxed mb-3">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[#6c63ff] pl-4 my-2 mb-4 italic text-[#9090b8]">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[14px] text-[#c0c0d8] marker:text-[#6c63ff]">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[#e0e0f0]">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-[#9090b8]">{children}</em>
  ),
  hr: () => (
    <hr className="border-none border-t border-[#1e1e2e] my-7" />
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-[#6c63ff] hover:underline">{children}</a>
  ),
  code: ({ children, className }) => {
    // block code (inside pre) vs inline code
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className="text-[12px] text-[#c0c0d8]">{children}</code>;
    }
    return (
      <code className="font-mono text-[11px] bg-[#12122a] border border-[#1e1e2e] rounded px-1.5 py-0.5 text-[#a78bfa]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-lg px-4 py-3.5 overflow-x-auto mb-4 text-[12px]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-[#2a2a3a]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="font-mono text-[10px] tracking-widest uppercase text-[#7c7c9a] px-3 py-2 text-left font-normal">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[#c0c0d8] border-b border-[#14141f]">{children}</td>
  ),
  details: ({ children, ...props }) => (
    <details
      className="bg-[#0d0d1a] border border-[#1e1e2e] rounded-lg px-3.5 py-2.5 mb-3 open:pb-3.5 group"
      {...(props as React.HTMLAttributes<HTMLDetailsElement>)}
    >
      {children}
    </details>
  ),
  summary: ({ children, ...props }) => (
    <summary
      className="font-mono text-[11px] tracking-widest text-[#7c7c9a] cursor-pointer select-none list-none flex items-center gap-1.5 before:content-['▶'] before:text-[8px] before:transition-transform group-open:before:rotate-90"
      {...(props as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </summary>
  ),
};

// ─── component ───────────────────────────────────────────────────────────────

type Report = { internal: string; client: string };

export function ReportPanel({ report }: { report: Report }) {
  return (
    <div className="mt-12">
      <Tabs defaultValue="client">
        <div className="flex items-center justify-between mb-5">
          <span className="font-mono text-[10px] tracking-[0.15em] text-[#7c7c9a]">REPORT</span>
          <TabsList>
            <TabsTrigger value="client">CLIENT</TabsTrigger>
            <TabsTrigger value="internal">INTERNAL</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="client">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={md}>
            {report.client}
          </ReactMarkdown>
        </TabsContent>

        <TabsContent value="internal">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={md}>
            {report.internal}
          </ReactMarkdown>
        </TabsContent>
      </Tabs>
    </div>
  );
}
