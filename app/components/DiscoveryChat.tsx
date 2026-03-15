"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { ToolUIPart } from "ai";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { DynamicForm } from "./DynamicForm";
import {
  EXAMPLE,
  type DynamicFormData,
  type DynamicFormField,
  type BootstrapFormData,
  type ClarificationNeeded,
} from "./types";
import { Button } from "@/components/ui/button";
import { tempBrief, tempProjectId } from "./tempData";

interface RenderFormInput {
  theme: string;
  intro: string;
  fields: DynamicFormField[];
}

interface Props {
  onComplete: (projectId: string, brief: string, sandbox?: boolean) => void;
  initialProjectId?: string;
  clarificationContext?: ClarificationNeeded;
}

// The PM sends this exact text when recruitment is done
const COMPLETION_SIGNAL = "[HANDOFF_COMPLETE]";

type DiscoveryPhase = "bootstrap" | "chat";

// ── Bootstrap form ────────────────────────────────────────────────────────────

function BootstrapForm({
  onSubmit,
}: {
  onSubmit: (data: BootstrapFormData) => void;
}) {
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [project, setProject] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || !sector.trim() || !project.trim()) return;
    onSubmit({ company: company.trim(), sector: sector.trim(), project: project.trim() });
  }

  function loadExample() {
    setCompany("AcmeCorp HR");
    setSector("HR software");
    setProject(
      "We want to replace our paper and Excel-based employee onboarding with a web app. Right now the HR manager sends emails manually, prints documents, chases signatures, and tracks everything in a spreadsheet. It takes 2 weeks.",
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#0d0d1a",
    border: "1px solid #1e1e2e",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#c0c0d8",
    fontSize: "14px",
    outline: "none",
    fontFamily: "inherit",
    resize: "vertical" as const,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#6c63ff",
    marginBottom: "6px",
    textTransform: "uppercase" as const,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "24px" }}
    >
      <div>
        <div style={{ marginBottom: "4px", fontSize: "12px", color: "#5a5a7a" }}>
          Before we start — tell us the basics
        </div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#e0e0f0" }}>
          Your project
        </div>
      </div>

      <div>
        <label style={labelStyle}>Company name</label>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="e.g. AcmeCorp, Sodexo France, Startup XYZ"
          style={inputStyle}
          required
        />
      </div>

      <div>
        <label style={labelStyle}>Sector / industry</label>
        <input
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="e.g. HR software, French retail, healthcare, logistics"
          style={inputStyle}
          required
        />
      </div>

      <div>
        <label style={labelStyle}>Project in one sentence</label>
        <textarea
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="e.g. We want to replace our Excel-based onboarding process with a web app"
          style={{ ...inputStyle, minHeight: "80px" }}
          required
        />
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <button
          type="submit"
          disabled={!company.trim() || !sector.trim() || !project.trim()}
          style={{
            flex: 1,
            padding: "12px",
            background: "#6c63ff",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          START PROJECT →
        </button>
        <Button type="button" onClick={loadExample} variant="outline">
          LOAD EXAMPLE
        </Button>
      </div>
    </form>
  );
}

// ── Main chat ─────────────────────────────────────────────────────────────────

export function DiscoveryChat({ onComplete, initialProjectId, clarificationContext }: Props) {
  // Skip bootstrap when re-engaging client for clarification
  const [phase, setPhase] = useState<DiscoveryPhase>(
    clarificationContext ? "chat" : "bootstrap",
  );
  const [projectId, setProjectId] = useState<string | null>(initialProjectId ?? null);
  const [submittedFormIds, setSubmittedFormIds] = useState<Set<string>>(
    new Set(),
  );
  const completionTriggered = useRef(false);
  const clarificationSent = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/discovery",
        fetch: async (input, init) => {
          const response = await globalThis.fetch(
            input as RequestInfo,
            init as RequestInit,
          );
          const pid = response.headers.get("x-project-id");
          if (pid) {
            setProjectId(pid);
          }
          return response;
        },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({ transport });

  // In clarification mode: auto-send the QA blocking questions to the PM on mount
  useEffect(() => {
    if (!clarificationContext || clarificationSent.current || status !== "ready") return;
    clarificationSent.current = true;
    const questionList = clarificationContext.questions
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join("\n");
    sendMessage(
      {
        text: `[CLARIFICATION]\nThe technical audit identified the following blocking questions that require client input:\n\n${questionList}\n\nPlease ask the client these specific questions to unblock the specification.`,
      },
      { body: { projectId } },
    );
  }, [clarificationContext, status, projectId, sendMessage]);

  // Detect completion signal
  useEffect(() => {
    if (status !== "ready" || completionTriggered.current) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;

    const hasCompletion = lastMsg.parts.some(
      (p) =>
        p.type === "text" &&
        "text" in p &&
        (p as any).text.includes(COMPLETION_SIGNAL),
    );

    if (hasCompletion && projectId) {
      completionTriggered.current = true;
      const brief = messages
        .filter((m) => m.role === "user")
        .map((m) =>
          m.parts
            .filter((p) => p.type === "text" && "text" in p)
            .map((p) => (p as any).text as string)
            .join(""),
        )
        .filter(Boolean)
        .join("\n\n");

        console.log(projectId)
        console.log(brief)
      const timer = setTimeout(() => onComplete(projectId, brief), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, messages, projectId, onComplete]);

  function handleBootstrapSubmit(data: BootstrapFormData) {
    const text = `Company: ${data.company}\nSector: ${data.sector}\nProject: ${data.project}`;
    setPhase("chat");
    sendMessage(
      { text },
      { body: { projectId } },
    );
  }


  function handleFormSubmit(toolCallId: string, formData: DynamicFormData) {
    setSubmittedFormIds((prev) => new Set([...prev, toolCallId]));
    const lines = formData.fields.map((f) => {
      const val = Array.isArray(f.value) ? f.value.join(", ") : f.value;
      return `${f.label}: ${val}`;
    });
    sendMessage(
      { text: `[${formData.theme}]\n${lines.join("\n")}` },
      { body: { projectId } },
    );
  }

  function handleSendMessage(message: string) {
    sendMessage({ text: message }, { body: { projectId } });
  }

  function handleTempRun() {
    onComplete(tempProjectId, tempBrief, true);
  }
  const isStreaming = status === "submitted" || status === "streaming";

  return (
    <div className="mb-7 flex flex-col gap-0 rounded-xl border border-[#1e1e2e] bg-[#0d0d1a]">
      <Button type="button" onClick={handleTempRun}>Temp</Button>
      {/* Bootstrap phase */}
      {phase === "bootstrap" && (
        <BootstrapForm onSubmit={handleBootstrapSubmit} />
      )}

      {/* Chat phase */}
      {phase === "chat" && (
        <>
          <Conversation className="max-h-125 min-h-30 overflow-auto">
            <ConversationContent className="gap-4 p-5">
              {messages.map((msg) => (
                <Message key={msg.id} from={msg.role}>
                  <MessageContent>
                    {msg.role === "user" &&
                      msg.parts
                        .filter((p) => p.type === "text" && "text" in p)
                        .map((p, i) => (
                          <span key={i} className="text-sm text-[#c0c0d8]">
                            {(p as any).text}
                          </span>
                        ))}

                    {msg.role === "assistant" &&
                      msg.parts.map((part, i) => {
                        if (isToolUIPart(part)) {
                          const dp = part as ToolUIPart;

                          // render_form: show the interactive form
                          if (dp.type === "tool-render_form") {
                            if (dp.state === "input-streaming") {
                              return (
                                <div
                                  key={i}
                                  className="h-20 animate-pulse rounded-lg bg-[#1e1e2e]"
                                />
                              );
                            }
                            const form = dp.input as RenderFormInput;
                            if (!form?.fields) return null;

                            if (submittedFormIds.has(dp.toolCallId)) {
                              return (
                                <p
                                  key={i}
                                  className="font-mono text-[10px] tracking-widest text-[#4ade80]"
                                >
                                  ✓ {form.theme}
                                </p>
                              );
                            }
                            return (
                              <DynamicForm
                                key={i}
                                form={form}
                                onSubmit={(data) =>
                                  handleFormSubmit(dp.toolCallId, data)
                                }
                                disabled={isStreaming}
                              />
                            );
                          }

                          // web_search: show a subtle indicator
                          if (dp.type === "tool-web_search") {
                            if (dp.state === "input-streaming" || dp.state === "input-available") {
                              return (
                                <p
                                  key={i}
                                  className="font-mono text-[10px] tracking-widest text-[#3a3a5a]"
                                >
                                  ↗ Researching sector...
                                </p>
                              );
                            }
                            return null;
                          }

                          // recruit_agent: show a confirmation
                          if (dp.type === "tool-recruit_agent" && dp.state === "output-available") {
                            const out = dp.output as { agentType?: string } | null;
                            if (out?.agentType) {
                              return (
                                <p
                                  key={i}
                                  className="font-mono text-[10px] tracking-widest text-[#6c63ff]"
                                >
                                  ✓ {out.agentType} recruited
                                </p>
                              );
                            }
                          }

                          return null;
                        }

                        // Text
                        if (part.type === "text" && "text" in part) {
                          const text = (part as any).text as string;
                          // Strip the handoff marker from display
                          const display = text.replace("[HANDOFF_COMPLETE]", "").trim();
                          if (!display) return null;
                          return (
                            <MessageResponse key={i}>{display}</MessageResponse>
                          );
                        }

                        return null;
                      })}
                  </MessageContent>
                </Message>
              ))}

              {isStreaming && (
                <Message from="assistant">
                  <MessageContent>
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="inline-block h-1 w-1 animate-pulse rounded-full bg-[#6c63ff]"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        />
                      ))}
                    </span>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
          </Conversation>

          <PromptInput
            className="border-0 bg-transparent shadow-none"
            onSubmit={({ text }) => {
              if (text.trim()) handleSendMessage(text);
            }}
          >
            <PromptInputTextarea
              placeholder="Your answer..."
              className="bg-transparent placeholder:text-white"
              disabled={isStreaming}
            />
            <PromptInputFooter>
              <div className="font-mono text-[10px] tracking-widest text-[#3a3a5a]">
                PM INTERVIEW
              </div>
              <PromptInputSubmit
                status={status}
                onStop={() => {}}
                className="bg-[#6c63ff] text-white hover:bg-[#5a54e0]"
              />
            </PromptInputFooter>
          </PromptInput>
        </>
      )}
    </div>
  );
}
