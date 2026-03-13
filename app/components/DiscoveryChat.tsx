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
} from "./types";
import { Button } from "@/components/ui/button";

interface RenderFormInput {
  theme: string;
  intro: string;
  fields: DynamicFormField[];
}

interface Props {
  onComplete: (projectId: string, brief: string) => void;
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

export function DiscoveryChat({ onComplete }: Props) {
  const [phase, setPhase] = useState<DiscoveryPhase>("bootstrap");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submittedFormIds, setSubmittedFormIds] = useState<Set<string>>(
    new Set(),
  );
  const completionTriggered = useRef(false);

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
    const projectId = "proj-VznFStwf";
    const brief = `Company: Solinn
Sector: Aide sociale à l'enfance
Project: Cette application doit permettre au départements français qui sont en charge de l'aide social à l'enfance de pouvoir suivre en temps réel les places disponibles, Sécuriser la RGPD sur les dossiers de l'enfants. Pouvoir suivre les évolutions scolaires, professionnelles de l'enfant dans les lieu de placement. Enregistrer des documents de suivi. Les établissements doivent pouvoir saisir des rapports pour que le conseillé du département en charge de l'enfant puisse voir ce qu'il se passe. Cette plateforme web doit être sécurisé avec une logic de tous les droits sont fermés par défault et on les ouvres au fur et à mesure par des gestions de rôles/Groupes. La plateforme doit pouvoir faciliter la communication entre les professionnels internes et externes autour de l'enfant. Nous devons aussi pouvoir générer des documents, uploader, downloader et pour des questions de traçabilité RGPD, nous devons maintenir un historique anymisable de l'ensembles des modifications, création archivache etc de toutes les collections.
Je vais d'abord effectuer des recherches approfondies sur votre secteur avant de vous poser les premières questions.

[Solinn — Contexte et organisation]
Combien de départements utilisateurs visez-vous au lancement ?: 1 département pilote
Quels types de structures d'accueil seront connectés à la plateforme ?: MECS (Maison d'Enfants à Caractère Social), Familles d'accueil, Foyers de l'enfance, Lieux de vie et d'accueil (LVA), Services d'accueil de jour, Autres établissements médico-sociaux
Quels outils utilisez-vous aujourd'hui pour gérer les dossiers enfants et les places disponibles ? (logiciels, tableurs, papier…): Excel
Quel est le volume approximatif d'enfants suivis par département ?: 500 à 1 500
Quels professionnels externes au département doivent accéder à la plateforme ?: Éducateurs des établissements, Assistants familiaux, Psychologues / thérapeutes, Enseignants / établissements scolaires, Magistrats / juges des enfants, Médecins / professionnels de santé
La plateforme est-elle destinée uniquement à la France métropolitaine, ou aussi aux DOM-TOM ?: Métropole + DOM-TOM


[Le problème et la vision cible] Aujourd'hui, quel est le problème le plus concret que vous rencontrez dans le suivi des places et des enfants ? (ce qui vous coûte le plus de temps ou génère le plus d'erreurs): Le principale pb est que nous passons trop de temps à chercher des places dispo. Nous devons appeler à chaque fois tous les lieux potentiels. Normalement les établissements devraient nous faire remonter leurs places dispo mais ils ne le font pas ou presque pas. ET nous ne sommes pas en règles RGPD Les dossiers des enfants contiendront-ils des informations médicales ou de santé (traitements, handicap, suivi psy) ?: Oui, des informations médicales seront présentes Avez-vous des données existantes (fichiers Excel, documents) à intégrer dans la nouvelle plateforme au démarrage ?: Partiellement, certaines données seulement La plateforme devra-t-elle se connecter à d'autres logiciels utilisés par le département (gestion administrative, paie, logiciel métier déjà en place) ?: Pour l'instant non Les agents du département ont-ils déjà un compte informatique professionnel (Active Directory, messagerie @departement.fr) qu'ils utilisent pour accéder à leurs outils ?: Non, chaque outil a ses propres identifiants Dans 12 mois, si la plateforme fonctionne parfaitement, qu'est-ce qui aura vraiment changé dans votre quotidien ?: Nous aurons gagné du temps et les travailleurs sociaux du département pourront avoir plus de temps pour les enfants et le contrôle des établissements d'accueil
✓ Les utilisateurs, les rôles et les règles métier

[Les utilisateurs, les rôles et les règles métier] Quels sont les différents types de personnes qui utiliseront la plateforme et quel est leur rôle principal ?: Un premier lieu, les travailleurs sociaux du département, pour faire les offres de placements auprès des établissements et faire le suivi des demandes. Ensuite pouvoir géréer le dossier de l'enfant, saisir des infos, uploader des documents. Les lieux d'accueils également: pour recevoir les demandes et compléter le dossier de l'enfant en fonction des actions prises, des compte d'activité, la scolarité et le professionnel, et également pouvoir signaler s'ils ont des places indiponibles Qu'est-ce qu'une 'place disponible' pour vous ? Est-ce que cela dépend du profil de l'enfant (age, genre, besoin spécifique) ?: Oui une place disponible est définis par des critères de l'enfant et la corrélation avec les caracteristiques de l'établissement. Par example un enfant de 12 garçon, ne peut pas être placé dans un établissement n'accueillant que des filles Comment doit fonctionner la transmission d'un rapport d'établissement vers le conseiller ? Y a-t-il une validation, une signature, une périodicité obligatoire ?: Les transmissions de rapport sont juste des comptes saisies par l'établissement ou le conseiller. Si c'est par l'établissement alors le conseiller en charge du suivi de l'enfant doit recevoir une notification Quand vous parlez de 'faciliter la communication entre professionnels', quelle forme cela doit-il prendre concrètement ?: Messagerie interne privée entre professionnels autour d'un enfant, Notifications et alertes automatiques (place libérée, rapport déposé, échéance...), Un fil de discussion attaché au dossier de l'enfant, Partage de documents entre professionnels, Agenda partagé / planning des échéances Quels types de documents devrez-vous générer depuis la plateforme ?: Tous les documents qui touchent à l'enfant: judiciaires, médical, dossier info comme pièce d'identité etc... L'enfant lui-même ou sa famille aura-t-il accès à une partie de la plateforme (consultation du dossier, droit d'accès RGPD) ?: Non, la plateforme est réservée aux professionnels

[Priorités, périmètre et contraintes] Parmi toutes les fonctionnalités décrites, lesquelles sont absolument indispensables dès le départ pour que la plateforme soit utile ?: Tableau de bord des places disponibles en temps réel, Dossier complet de l'enfant (informations, documents, historique), Demandes de placement avec matching profil/établissement, Suivi scolaire et professionnel de l'enfant, Saisie de rapports et comptes-rendus par les établissements, Notifications automatiques, Gestion des rôles et des droits d'accès, Historique et traçabilité RGPD anonymisable, Messagerie et fil de discussion autour du dossier enfant Quand un travailleur social cherche une place : envoie-t-il une demande à un seul établissement à la fois, ou à plusieurs simultanément ?: Plusieurs établissements en même temps Qui sera responsable de gérer les comptes utilisateurs et les droits d'accès sur la plateforme (créer un compte, donner ou retirer des accès) ?: Un administrateur désigné côté département Avez-vous une enveloppe budgétaire définie pour ce projet ?: Pas encore défini Y a-t-il une échéance particulière à respecter pour le lancement (décision politique, appel d'offre, début d'année scolaire...) ?: Septembre 2026 Avez-vous envisagé d'utiliser l'intelligence artificielle dans la plateforme (suggestions automatiques de placement, analyse de dossiers, alertes prédictives...) ?: Oui, à envisager dans une version future
✓ Impact et mesure du succès


[Impact et mesure du succès] Comment saurez-vous que la plateforme est un succès ? Y a-t-il des résultats concrets que vous pourrez mesurer (temps gagné, nombre d'appels évités, délais de placement réduits...) ?: temps gagné, nombre d'appels évités, délais de placement réduits. Avez-vous des inquiétudes sur l'adoption de la plateforme par les établissements ou les familles d'accueil (certains pourraient résister au changement ou avoir des difficultés avec le numérique) ?: Oui, le premier lieu d'inquiétude est déjà l'adoption par les départements eux-même.

[Solinn — Impact et mise en œuvre]
Aujourd'hui, combien de temps prend en moyenne la recherche d'une place disponible pour un enfant (du premier appel à la confirmation) ?: 1 à 3 jours
Combien de nouvelles demandes de placement sont traitées en moyenne par mois dans un département ?: Moins de 20
Avez-vous déjà un plan pour accompagner les établissements dans la prise en main ? (formation, référent numérique, support…): non
Le département pilote est-il déjà identifié ? Si oui, avez-vous une idée de ses contraintes particulières ?: Oui l'Ain
Les données Excel à importer concernent quoi principalement ?: Liste des établissements et leurs capacités, Historique des placements passés, Listes d'utilisateurs / travailleurs sociaux`;
onComplete(projectId, brief);
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
