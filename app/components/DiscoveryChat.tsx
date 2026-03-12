"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
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
import { EXAMPLE, type DynamicFormData, type DynamicFormField } from "./types";
import { Button } from "@/components/ui/button";

interface RenderFormInput {
  theme: string;
  intro: string;
  fields: DynamicFormField[];
}

interface Props {
  onComplete: (projectId: string, brief: string) => void;
}

const COMPLETION_SIGNAL = "Merci, j'ai tout ce qu'il me faut";

export function DiscoveryChat({ onComplete }: Props) {
  const projectIdRef = useRef<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submittedFormIds, setSubmittedFormIds] = useState<Set<string>>(
    new Set(),
  );
  const completionTriggered = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/discovery",
        // prepareSendMessagesRequest: ({ body }) => ({
        //   body: {
        //     ...body,
        //     messages: [],
        //     ...(projectIdRef.current
        //       ? { projectId: projectIdRef.current }
        //       : {}),
        //   },
        // }),
        fetch: async (input, init) => {
          const response = await globalThis.fetch(
            input as RequestInfo,
            init as RequestInit,
          );
          const pid = response.headers.get("x-project-id");
          if (pid && !projectIdRef.current) {
            projectIdRef.current = pid;
            setProjectId(pid);
          }
          return response;
        },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({ transport });

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

      const timer = setTimeout(() => onComplete(projectId, brief), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, messages, projectId, onComplete]);

  console.log(messages);

  function handleFormSubmit(toolCallId: string, data: DynamicFormData) {
    setSubmittedFormIds((prev) => new Set([...prev, toolCallId]));
    const lines = data.fields.map((f) => {
      const val = Array.isArray(f.value) ? f.value.join(", ") : f.value;
      return `${f.label}: ${val}`;
    });
    sendMessage(
      { text: `[${data.theme}]\n${lines.join("\n")}` },
      {
        body: {
          ...(projectIdRef.current ? { projectId: projectIdRef.current } : {}),
        },
      },
    );
  }

  function loadExample() {
    sendMessage({
      text: EXAMPLE,
    });
  }
  const isStreaming = status === "submitted" || status === "streaming";
  const hasStarted = messages.length > 0;

  return (
    <div className="mb-7 flex flex-col gap-0 rounded-xl border border-[#1e1e2e] bg-[#0d0d1a]">
      {/* Conversation area */}
      {/* {hasStarted && ( */}
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
                      console.log(part);
                      const dp = part as ToolUIPart;
                      if (dp.type !== "tool-render_form") return null;
                      if (dp.state === "input-streaming") {
                        return (
                          <div
                            key={i}
                            className="h-20 animate-pulse rounded-lg bg-[#1e1e2e]"
                          />
                        );
                      }

                      const form = dp.input as RenderFormInput;
                      console.log();
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
                    // Text
                    if (part.type === "text" && "text" in part) {
                      const text = (part as any).text as string;
                      if (!text.trim()) return null;
                      return <MessageResponse key={i}>{text}</MessageResponse>;
                    }

                    // render_form tool

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
      {/* )} */}

      {/* Initial prompt input — shown before the conversation starts */}

      <PromptInput
        className="border-0 bg-transparent shadow-none"
        onSubmit={({ text }) => {
          if (text.trim()) sendMessage({ text });
        }}
      >
        <PromptInputTextarea
          placeholder="Décrivez votre projet en quelques mots..."
          className="bg-transparent placeholder:text-white"
          disabled={isStreaming}
        />
        <PromptInputFooter>
          <div className="font-mono text-[10px] tracking-widest text-[#3a3a5a]">
            DISCOVERY
          </div>
          <Button type="button" onClick={loadExample}>
            LOAD EXAMPLE
          </Button>
          <PromptInputSubmit
            status={status}
            onStop={() => {}}
            className="bg-[#6c63ff] text-white hover:bg-[#5a54e0]"
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
