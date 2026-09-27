"use client";

import {
  archiveClinicalDocumentTemplate,
  createBrowserSupabaseClient,
  getClinicalTemplateAssetContext,
  getClinicalDocumentTemplates,
  getCurrentStaffOrganization,
  getEncounterTemplateContext,
  hasOrganizationPermission,
  saveClinicalDocumentTemplate,
  searchIcd10Reference,
} from "@odyssey/supabase-client";
import type {
  ClinicalDocumentTemplate,
  ClinicalDocumentTemplateContent,
  ClinicalDocumentTemplateInput,
  ClinicalDocumentTemplateStatus,
  ClinicalDocumentTemplateType,
  Icd10ReferenceCondition,
  TemplateMedicationLine,
} from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import { Check, Copy, FilePlus2, FolderArchive, ImagePlus, Save, Search, Send, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const tokens = [
  "patient.name", "patient.age", "patient.dob", "doctor.name", "doctor.license_no",
  "doctor.prc_no", "clinic.name", "clinic.address", "encounter.date", "diagnosis.summary",
  "rest_days", "medication.name", "medication.dosage", "medication.directions",
];

const previewValues: Record<string, string> = {
  "patient.name": "Alex Santos", "patient.age": "34", "patient.dob": "1992-04-18",
  "doctor.name": "Dr. Maria Reyes", "doctor.license_no": "LIC-123456", "doctor.prc_no": "PRC-789012",
  "clinic.name": "Odyssey Family Clinic", "clinic.address": "Makati City, Philippines",
  "encounter.date": "September 26, 2026", "diagnosis.summary": "Acute upper respiratory tract infection",
  rest_days: "3", "medication.name": "Amoxicillin", "medication.dosage": "500 mg", "medication.directions": "Take one capsule every 8 hours",
};

const emptyMedication = (): TemplateMedicationLine => ({ name: "", dosage: "", frequency: "", duration: "", notes: "" });
const emptyContent = (type: ClinicalDocumentTemplateType): ClinicalDocumentTemplateContent => ({
  html: type === "medical_certificate"
    ? "<p>This is to certify that <strong>{{patient.name}}</strong> was evaluated on {{encounter.date}} for {{diagnosis.summary}}.</p><p>The patient is advised to rest for {{rest_days}} day(s).</p>"
    : "<h2>Prescription</h2><p>{{patient.name}} · {{encounter.date}}</p>",
  medications: type === "prescription" ? [emptyMedication()] : [],
  branding: { source: "none" },
  ...(type === "medical_certificate" ? { certificate: { variant: "general" as const, remarks: "", restDays: "" } } : {}),
});

function sanitizeTemplateHtml(html: string) {
  if (typeof window === "undefined") return html;
  return (() => {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "H2", "H3", "DIV"]);
    [...parsed.body.querySelectorAll("*")].forEach((element) => {
      if (!allowed.has(element.tagName)) element.replaceWith(document.createTextNode(element.textContent ?? ""));
      else [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
    });
    return parsed.body.innerHTML;
  })();
}

function renderTokens(html: string) {
  const source = sanitizeTemplateHtml(html);
  return source.replace(/\{\{([a-z_.]+)\}\}/g, (_match, key: string) => previewValues[key] ?? `{{${key}}}`);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function normalizeContent(value: ClinicalDocumentTemplateContent): ClinicalDocumentTemplateContent {
  return { ...value, html: value.html.trim(), medications: value.medications.filter((line) => Object.values(line).some(Boolean)) };
}

type EditorState = Omit<ClinicalDocumentTemplateInput, "id"> & { id?: string };

function toEditor(template?: ClinicalDocumentTemplate): EditorState {
  if (!template) return { type: "medical_certificate", title: "", scope: "personal", content: emptyContent("medical_certificate"), isDefault: false, status: "draft" };
  return {
    id: template.id, type: template.type, title: template.title,
    scope: template.ownerDoctorId ? "personal" : "clinic_shared",
    conditionSystem: template.conditionSystem, conditionCode: template.conditionCode, conditionDisplay: template.conditionDisplay,
    content: template.content, isDefault: template.isDefault,
    status: template.status === "archived" ? "draft" : template.status,
  };
}

function EditorToolbar({ onInsert }: { onInsert: (token: string) => void }) {
  const command = (name: string, value?: string) => document.execCommand(name, false, value);
  return <div className="template-editor-toolbar" role="toolbar" aria-label="Template formatting">
    <Button type="button" variant="outline" size="sm" onMouseDown={(event) => { event.preventDefault(); command("bold"); }}>Bold</Button>
    <Button type="button" variant="outline" size="sm" onMouseDown={(event) => { event.preventDefault(); command("italic"); }}>Italic</Button>
    <Button type="button" variant="outline" size="sm" onMouseDown={(event) => { event.preventDefault(); command("insertUnorderedList"); }}>Bullets</Button>
    <Button type="button" variant="outline" size="sm" onMouseDown={(event) => { event.preventDefault(); command("formatBlock", "h2"); }}>Heading</Button>
    <label className="template-token-picker">
      <span className="sr-only">Insert a placeholder</span>
      <select aria-label="Insert placeholder" defaultValue="" onChange={(event) => { if (event.target.value) onInsert(event.target.value); event.target.value = ""; }}>
        <option value="">Insert placeholder…</option>
        {tokens.map((token) => <option key={token} value={token}>{`{{${token}}}`}</option>)}
      </select>
    </label>
  </div>;
}

export function TemplateStudio() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ClinicalDocumentTemplate[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [status, setStatus] = useState("Checking template access…");
  const [canManage, setCanManage] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | ClinicalDocumentTemplateType>("all");
  const [stateFilter, setStateFilter] = useState<"all" | ClinicalDocumentTemplateStatus>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"Saved" | "Saving…" | "Unsaved">("Saved");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conditionQuery, setConditionQuery] = useState("");
  const [conditionResults, setConditionResults] = useState<Icd10ReferenceCondition[]>([]);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [activeConditionIndex, setActiveConditionIndex] = useState(-1);
  const [unclassified, setUnclassified] = useState(true);
  const [assetContext, setAssetContext] = useState<{ practitionerId: string; clinicLogoUrl: string | null } | null>(null);
  const [assetPreviews, setAssetPreviews] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  const load = useCallback(async () => {
    const client = createBrowserSupabaseClient();
    const organization = await getCurrentStaffOrganization(client);
    if (organization.error || !organization.data) { setStatus("Your clinic context is unavailable."); return; }
    const permission = await hasOrganizationPermission(client, organization.data, "can_manage_document_templates");
    setOrganizationId(organization.data);
    setCanManage(Boolean(permission.data));
    if (permission.error || !permission.data) { setStatus("You do not have permission to manage document templates."); return; }
    const [result, assets] = await Promise.all([
      getClinicalDocumentTemplates(client, organization.data),
      getClinicalTemplateAssetContext(client, organization.data),
    ]);
    if (result.error) { setStatus(`Templates could not be loaded: ${result.error.message}`); return; }
    if (!assets.error) {
      setAssetContext(assets.data);
    }
    setTemplates(result.data);
    setStatus("Template library ready.");
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (editor && bodyRef.current) bodyRef.current.innerHTML = editor.content.html; }, [editor?.id, editor?.type]);

  const filtered = useMemo(() => templates.filter((template) => {
    const matchesSearch = !librarySearch.trim() || [template.title, template.conditionDisplay, template.conditionCode]
      .some((value) => value?.toLocaleLowerCase().includes(librarySearch.trim().toLocaleLowerCase()));
    return matchesSearch && (typeFilter === "all" || template.type === typeFilter) && (stateFilter === "all" || template.status === stateFilter);
  }), [librarySearch, stateFilter, templates, typeFilter]);

  const headerPreview = editor?.content.branding?.source === "clinic"
    ? assetContext?.clinicLogoUrl ?? assetPreviews[editor.content.branding?.headerLogoPath ?? ""]
    : editor?.content.branding?.source === "personal"
      ? assetPreviews[editor.content.branding?.headerLogoPath ?? ""]
      : undefined;
  const watermarkPreview = editor?.content.branding?.watermarkPath ? assetPreviews[editor.content.branding.watermarkPath] : undefined;

  function updateContent(next: Partial<ClinicalDocumentTemplateContent>) {
    setDirty(true);
    setAutosaveState("Unsaved");
    setEditor((current) => current ? { ...current, content: { ...current.content, ...next } } : current);
  }

  function updateEditor(next: Partial<EditorState>) {
    setDirty(true);
    setAutosaveState("Unsaved");
    setEditor((current) => current ? { ...current, ...next } : current);
  }

  function insertToken(token: string) {
    bodyRef.current?.focus();
    const selection = window.getSelection();
    if (selection && selectionRef.current) { selection.removeAllRanges(); selection.addRange(selectionRef.current); }
    const value = `{{${token}}}`;
    document.execCommand("insertText", false, value);
    if (bodyRef.current) updateContent({ html: bodyRef.current.innerHTML });
  }

  function validate(nextStatus: "draft" | "published") {
    const next: Record<string, string> = {};
    const html = bodyRef.current?.innerHTML ?? editor?.content.html ?? "";
    if (!editor?.title.trim()) next.title = "A template title is required.";
    if (!html.trim()) next.body = "A document body is required.";
    if (nextStatus === "published" && !editor?.conditionCode && !editor?.conditionDisplay?.trim()) next.condition = "Select an ICD-10 condition or enter an unclassified condition label before publishing.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save(nextStatus: "draft" | "published", closeAfterSave = true) {
    if (!editor || !organizationId || !bodyRef.current) return;
    const content = normalizeContent({ ...editor.content, html: sanitizeTemplateHtml(bodyRef.current.innerHTML) });
    if (!validate(nextStatus)) { setStatus("Review the highlighted fields before publishing."); return; }
    setSaving(true);
    setAutosaveState("Saving…");
    const result = await saveClinicalDocumentTemplate(createBrowserSupabaseClient(), organizationId, { ...editor, title: editor.title.trim(), content, status: nextStatus });
    setSaving(false);
    if (result.error) { setStatus(`Template could not be saved: ${result.error.message}`); setAutosaveState("Unsaved"); return; }
    setStatus(nextStatus === "published" ? "Template published. Issued documents will retain this version." : "Draft saved.");
    setDirty(false);
    setAutosaveState("Saved");
    if (closeAfterSave) setEditor(null);
    else setEditor((current) => current ? { ...current, id: result.data, content } : current);
    await load();
  }

  useEffect(() => {
    if (!editor || !dirty || editor.title.trim().length < 2 || saving) return;
    const timer = window.setTimeout(() => { void save("draft", false); }, 800);
    return () => window.clearTimeout(timer);
  }, [dirty, editor, saving]);

  useEffect(() => {
    if (!conditionQuery.trim() || conditionQuery.trim().length < 2 || unclassified) { setConditionResults([]); return; }
    const timer = window.setTimeout(async () => {
      const result = await searchIcd10Reference(createBrowserSupabaseClient(), conditionQuery);
      if (!result.error) { setConditionResults(result.data); setConditionOpen(true); setActiveConditionIndex(-1); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [conditionQuery, unclassified]);

  useEffect(() => {
    const paths = [editor?.content.branding?.headerLogoPath, editor?.content.branding?.watermarkPath].filter((value): value is string => Boolean(value));
    if (!paths.length) return;
    let active = true;
    void Promise.all(paths.map(async (path) => {
      const signed = await createBrowserSupabaseClient().storage.from("template-assets").createSignedUrl(path, 60 * 30);
      return [path, signed.data?.signedUrl] as const;
    })).then((entries) => {
      if (active) setAssetPreviews((current) => ({ ...current, ...Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))) }));
    });
    return () => { active = false; };
  }, [editor?.content.branding?.headerLogoPath, editor?.content.branding?.watermarkPath]);

  // The print paper is intentionally contentEditable-adjacent markup. Keep its
  // decorative asset layer outside the template HTML so it never becomes part
  // of an issued document body or user-controlled rich text.
  useEffect(() => {
    const paper = document.querySelector<HTMLElement>(".template-paper");
    if (!paper) return;
    paper.querySelectorAll(".template-paper-logo, .template-paper-watermark").forEach((node) => node.remove());
    if (watermarkPreview) {
      const watermark = document.createElement("img");
      watermark.className = "template-paper-watermark";
      watermark.src = watermarkPreview;
      watermark.alt = "";
      paper.prepend(watermark);
    }
    if (headerPreview) {
      const header = paper.querySelector("header");
      if (header) {
        const logo = document.createElement("img");
        logo.className = "template-paper-logo";
        logo.src = headerPreview;
        logo.alt = "Selected document header logo";
        header.prepend(logo);
      }
    }
  }, [headerPreview, watermarkPreview]);

  function chooseCondition(condition: Icd10ReferenceCondition) {
    updateEditor({ conditionSystem: "ICD-10", conditionCode: condition.code, conditionDisplay: condition.description });
    setConditionQuery("");
    setConditionOpen(false);
    setConditionResults([]);
    setUnclassified(false);
    setErrors((current) => ({ ...current, condition: "" }));
  }

  async function uploadAsset(kind: "headerLogoPath" | "watermarkPath", file?: File) {
    if (!file || !editor || !organizationId || !assetContext) return;
    const accepted = ["image/png", "image/jpeg", "image/svg+xml"];
    if (!accepted.includes(file.type) || file.size > 5 * 1024 * 1024) {
      setStatus("Use a PNG, JPG, or SVG image no larger than 5 MB.");
      return;
    }
    if (file.type !== "image/svg+xml") {
      const localUrl = URL.createObjectURL(file);
      const image = new Image();
      const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve(null);
        image.src = localUrl;
      });
      URL.revokeObjectURL(localUrl);
      if (!dimensions || dimensions.width > 4096 || dimensions.height > 4096) {
        setStatus("Choose an image no larger than 4096 × 4096 pixels.");
        return;
      }
    }
    const source = editor.content.branding?.source ?? "none";
    const scope = source === "clinic" ? `clinic/${crypto.randomUUID()}` : `doctor/${assetContext.practitionerId}`;
    const safeName = file.name.toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const path = `org/${organizationId}/${scope}/${kind}-${crypto.randomUUID()}-${safeName}`;
    setSaving(true);
    const result = await createBrowserSupabaseClient().storage.from("template-assets").upload(path, file, { upsert: false, contentType: file.type });
    setSaving(false);
    if (result.error) { setStatus(`Image could not be uploaded: ${result.error.message}`); return; }
    updateContent({ branding: { ...(editor.content.branding ?? { source }), [kind]: path } });
    setStatus("Image uploaded. Review the print preview before publishing.");
  }

  function rememberSelection() {
    const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    if (range && bodyRef.current?.contains(range.commonAncestorContainer)) selectionRef.current = range.cloneRange();
  }

  function openEditor(next: EditorState) {
    setErrors({});
    setDirty(false);
    setAutosaveState("Saved");
    setUnclassified(!next.conditionCode);
    setConditionQuery("");
    setEditor(next);
  }

  async function archive(template: ClinicalDocumentTemplate) {
    if (!organizationId || !window.confirm(`Archive “${template.title}”? Issued documents will retain their existing template reference.`)) return;
    const result = await archiveClinicalDocumentTemplate(createBrowserSupabaseClient(), organizationId, template.id);
    if (result.error) { setStatus(`Template could not be archived: ${result.error.message}`); return; }
    setStatus("Template archived.");
    await load();
  }

  if (!canManage && status !== "Checking template access…") return <main className="template-shell"><section className="template-access-denied"><ShieldCheck aria-hidden="true" size={28} /><h1>Templates are restricted</h1><p>{status}</p><Link href="/">Return to workspace</Link></section></main>;

  return <main className="template-shell">
    <header className="template-page-header">
      <div><Link className="encounter-back" href="/">← Provider workspace</Link><p className="eyebrow">Clinical documents</p><h1>Templates</h1><p>Create condition-aware certificate and prescription starting points. Only published templates are selectable during an encounter.</p></div>
      <Button disabled={!canManage} onClick={() => openEditor(toEditor())}><FilePlus2 aria-hidden="true" size={16} /> New template</Button>
    </header>
    <p className="template-status" role="status">{status}</p>

    {editor ? <section className="template-workbench" aria-label="Template customizer">
      <header><div><p className="eyebrow">{editor.id ? "Edit template" : "New template"}</p><h2>{editor.title || "Untitled template"}</h2><p className={`template-autosave template-autosave--${autosaveState.toLocaleLowerCase().replace("…", "")}`} aria-live="polite">{autosaveState === "Saved" ? <Check aria-hidden="true" size={14} /> : null}{autosaveState}</p></div><Button variant="outline" onClick={() => setEditor(null)}>Close editor</Button></header>
      <div className="template-workbench-grid">
        <form className="template-form" onSubmit={(event) => { event.preventDefault(); void save(editor.status); }}>
          <Field label="Template title"><Input value={editor.title} onChange={(event) => updateEditor({ title: event.target.value })} maxLength={120} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "template-title-error" : undefined} required />{errors.title ? <small className="template-field-error" id="template-title-error">{errors.title}</small> : null}</Field>
          <div className="template-form-row"><Field label="Document type"><select className="odyssey-input" value={editor.type} onChange={(event) => { const type = event.target.value as ClinicalDocumentTemplateType; updateEditor({ type, content: emptyContent(type) }); }}><option value="medical_certificate">Medical Certificate</option><option value="prescription">Prescription</option></select></Field><Field label="Owner"><select className="odyssey-input" value={editor.scope} onChange={(event) => updateEditor({ scope: event.target.value as EditorState["scope"] })}><option value="personal">My personal template</option><option value="clinic_shared">Clinic shared template</option></select></Field></div>
          <fieldset className="template-condition"><legend>Condition match</legend><p>Search the PhilHealth ICD-10 case-rate reference. It is a shared lookup only; condition choices do not expose another clinic’s data.</p>
            {editor.conditionCode ? <div className="template-condition-chip"><span><strong>{editor.conditionCode}</strong> {editor.conditionDisplay}</span><button type="button" aria-label="Remove selected condition" onClick={() => { updateEditor({ conditionSystem: null, conditionCode: null, conditionDisplay: null }); setUnclassified(false); }}><X aria-hidden="true" size={15} /></button></div> : null}
            {!unclassified ? <div className="template-combobox"><label htmlFor="template-condition-search">Search a condition or ICD-10 code</label><div className="template-combobox-input"><Search aria-hidden="true" size={16} /><input id="template-condition-search" value={conditionQuery} placeholder="Search a condition or ICD-10 code…" role="combobox" aria-autocomplete="list" aria-expanded={conditionOpen} aria-controls="template-condition-results" aria-activedescendant={activeConditionIndex >= 0 ? `condition-result-${activeConditionIndex}` : undefined} onFocus={() => setConditionOpen(true)} onChange={(event) => setConditionQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveConditionIndex((index) => Math.min(index + 1, conditionResults.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveConditionIndex((index) => Math.max(index - 1, 0)); } else if (event.key === "Enter" && activeConditionIndex >= 0) { event.preventDefault(); chooseCondition(conditionResults[activeConditionIndex]); } else if (event.key === "Escape") setConditionOpen(false); }} /></div>
              {conditionOpen && conditionQuery.trim().length >= 2 ? <ul id="template-condition-results" className="template-condition-results" role="listbox">{conditionResults.length ? conditionResults.map((condition, index) => <li key={condition.code} id={`condition-result-${index}`} role="option" aria-selected={index === activeConditionIndex}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCondition(condition)}><strong>{condition.code}</strong><span>{condition.description}</span>{condition.category ? <small>{condition.category}</small> : null}</button></li>) : <li className="template-condition-empty">No matches — you can still enter this as an unclassified condition.</li>}</ul> : null}
            </div> : null}
            <label className="check-option"><input type="checkbox" checked={unclassified} onChange={(event) => { setUnclassified(event.target.checked); if (event.target.checked) updateEditor({ conditionSystem: null, conditionCode: null }); }} /> Enter as an unclassified condition</label>
            {unclassified ? <Field label="Unclassified condition label"><Input value={editor.conditionDisplay ?? ""} onChange={(event) => updateEditor({ conditionDisplay: event.target.value || null, conditionSystem: null, conditionCode: null })} placeholder="e.g. Acute upper respiratory infection" aria-invalid={Boolean(errors.condition)} />{errors.condition ? <small className="template-field-error">{errors.condition}</small> : null}</Field> : null}
            <label className="check-option"><input type="checkbox" checked={editor.isDefault} onChange={(event) => updateEditor({ isDefault: event.target.checked })} /> Set as the published default for this condition</label>
          </fieldset>
          <section><h3>Document body</h3><p className="hint">Use formatting and placeholders to compose the issued document. The preview uses sample clinical data.</p><EditorToolbar onInsert={insertToken} /><div ref={bodyRef} className="template-rich-editor" contentEditable role="textbox" aria-multiline="true" aria-label="Template body" aria-invalid={Boolean(errors.body)} suppressContentEditableWarning onFocus={rememberSelection} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); document.execCommand("bold"); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") { event.preventDefault(); document.execCommand("italic"); } }} onInput={(event) => { rememberSelection(); updateContent({ html: event.currentTarget.innerHTML }); }} />{errors.body ? <small className="template-field-error">{errors.body}</small> : null}</section>
          {editor.type === "medical_certificate" ? <fieldset className="template-condition"><legend>Certificate defaults</legend><div className="template-form-row"><Field label="Variant"><select className="odyssey-input" value={editor.content.certificate?.variant ?? "general"} onChange={(event) => updateContent({ certificate: { variant: event.target.value as "general" | "fitness_to_work" | "fitness_to_travel", remarks: editor.content.certificate?.remarks ?? "", restDays: editor.content.certificate?.restDays ?? "" } })}><option value="general">General certificate</option><option value="fitness_to_work">Fitness to work</option><option value="fitness_to_travel">Fitness to travel</option></select></Field><Field label="Default rest days"><Input value={editor.content.certificate?.restDays ?? ""} onChange={(event) => updateContent({ certificate: { variant: editor.content.certificate?.variant ?? "general", remarks: editor.content.certificate?.remarks ?? "", restDays: event.target.value } })} placeholder="e.g. 3" /></Field></div><Field label="Remarks"><textarea className="odyssey-input" rows={3} value={editor.content.certificate?.remarks ?? ""} onChange={(event) => updateContent({ certificate: { variant: editor.content.certificate?.variant ?? "general", restDays: editor.content.certificate?.restDays ?? "", remarks: event.target.value } })} /></Field></fieldset> : <MedicationLines lines={editor.content.medications} onChange={(medications) => updateContent({ medications })} />}
          <fieldset className="template-condition"><legend>Branding for print</legend><p>Images are private to this clinic or practitioner. Uploads are checked before use; use the preview to approve the crop and placement.</p><Field label="Header source"><select className="odyssey-input" value={editor.content.branding?.source ?? "none"} onChange={(event) => updateContent({ branding: { ...(editor.content.branding ?? {}), source: event.target.value as "none" | "personal" | "clinic" } })}><option value="none">None</option><option value="personal">Use my personal logo</option><option value="clinic">Use clinic logo</option></select></Field>{editor.content.branding?.source === "clinic" && assetContext?.clinicLogoUrl ? <button className="template-reuse-asset" type="button" onClick={() => setStatus("The configured clinic logo is shown in the preview and will be used for this template.")}>Reuse configured clinic logo</button> : null}<div className="template-upload-grid"><label className="template-upload"><ImagePlus aria-hidden="true" size={18} /><span>Header logo</span><small>PNG, JPG, or SVG · max 5 MB</small><input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => void uploadAsset("headerLogoPath", event.target.files?.[0])} /></label><label className="template-upload"><ImagePlus aria-hidden="true" size={18} /><span>Watermark</span><small>PNG, JPG, or SVG · max 5 MB</small><input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => void uploadAsset("watermarkPath", event.target.files?.[0])} /></label></div>{(headerPreview || watermarkPreview) ? <div className="template-asset-crop-preview" aria-label="Brand image preview">{headerPreview ? <img src={headerPreview} alt="Header logo preview" /> : null}{watermarkPreview ? <img src={watermarkPreview} alt="Watermark preview" /> : null}</div> : null}</fieldset>
          <div className="template-editor-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => void save("draft")}><Save aria-hidden="true" size={16} /> Save draft</Button><Button type="submit" disabled={saving}><Send aria-hidden="true" size={16} /> {saving ? "Saving…" : "Publish template"}</Button></div>
        </form>
        <aside className="template-preview"><p className="eyebrow">Live print preview</p><article className="template-paper"><header><strong>{previewValues["clinic.name"]}</strong><span>{previewValues["clinic.address"]}</span></header><h2>{editor.type === "medical_certificate" ? "Medical Certificate" : "Prescription"}</h2><div className="template-preview-body" dangerouslySetInnerHTML={{ __html: renderTokens(editor.content.html) }} />{editor.type === "prescription" && editor.content.medications.length ? <ol className="template-preview-meds">{editor.content.medications.filter((line) => line.name).map((line, index) => <li key={`${line.name}-${index}`}><strong>{line.name}</strong><span>{[line.dosage, line.frequency, line.duration, line.notes].filter(Boolean).join(" · ")}</span></li>)}</ol> : null}<footer><span>{previewValues["doctor.name"]}</span><small>License / PRC details appear when recorded.</small></footer></article></aside>
      </div>
    </section> : <>
      <div className="template-filters"><label>Search templates<Input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Title, condition, or ICD-10 code" /></label><label>Type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">All documents</option><option value="medical_certificate">Medical certificates</option><option value="prescription">Prescriptions</option></select></label><label>Status<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}><option value="all">All statuses</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div>
      <section className="template-library" aria-label="Template library">{filtered.length ? filtered.map((template) => <article key={template.id} className="template-list-card"><div><div className="template-card-meta"><span>{template.type === "medical_certificate" ? "Medical Certificate" : "Prescription"}</span><span className={`template-state template-state--${template.status}`}>{template.status}</span>{template.isDefault ? <span className="template-default">Default</span> : null}</div><h2>{template.title}</h2><p>{template.conditionDisplay ?? "Unclassified condition"}{template.ownerDoctorId ? " · Personal" : " · Clinic shared"}</p><small>v{template.version} · Updated {dateTime(template.updatedAt)}</small></div><div className="template-card-actions"><Button size="sm" variant="outline" onClick={() => setEditor(toEditor(template))}>Edit</Button><Button size="sm" variant="outline" onClick={() => setEditor({ ...toEditor(template), id: undefined, title: `${template.title} copy`, status: "draft", isDefault: false })}><Copy aria-hidden="true" size={14} /> Duplicate</Button>{template.status !== "archived" ? <Button size="sm" variant="outline" onClick={() => void archive(template)}><FolderArchive aria-hidden="true" size={14} /> Archive</Button> : null}</div></article>) : <section className="template-empty"><h2>No matching templates</h2><p>Create a condition-aware certificate or prescription starting point for this clinic.</p></section>}</section>
    </>}
  </main>;
}

function MedicationLines({ lines, onChange }: { lines: TemplateMedicationLine[]; onChange: (lines: TemplateMedicationLine[]) => void }) {
  function update(index: number, key: keyof TemplateMedicationLine, value: string) { onChange(lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)); }
  return <fieldset className="template-condition"><legend>Default medication regimen</legend><p>Each line stays editable when the prescription is issued.</p>{lines.map((line, index) => <div className="template-medication-line" key={index}><Field label="Medication"><Input value={line.name} onChange={(event) => update(index, "name", event.target.value)} placeholder="Medication name" /></Field><Field label="Dosage"><Input value={line.dosage} onChange={(event) => update(index, "dosage", event.target.value)} placeholder="e.g. 500 mg" /></Field><Field label="Frequency"><Input value={line.frequency} onChange={(event) => update(index, "frequency", event.target.value)} placeholder="e.g. every 8 hours" /></Field><Field label="Duration"><Input value={line.duration} onChange={(event) => update(index, "duration", event.target.value)} placeholder="e.g. 7 days" /></Field><Button type="button" size="sm" variant="outline" onClick={() => onChange(lines.filter((_, lineIndex) => lineIndex !== index))}>Remove</Button></div>)}<Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, emptyMedication()])}>Add medication</Button></fieldset>;
}

export interface TemplateApplication {
  templateId: string;
  templateVersion: number;
  title: string;
  body: string;
  medications: TemplateMedicationLine[];
}

function templateText(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return (parsed.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function fillTemplate(html: string, values: Record<string, string>) {
  return html.replace(/\{\{([a-z_.]+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

/** Published-template selector used by encounter and teleconsult issuance forms. */
export function ClinicalTemplatePicker({
  encounterId,
  organizationId,
  type,
  onApply,
}: {
  encounterId: string;
  organizationId: string;
  type: ClinicalDocumentTemplateType;
  onApply: (application: TemplateApplication | null) => void;
}) {
  const [templates, setTemplates] = useState<ClinicalDocumentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("Loading published templates…");
  const contextRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    async function load() {
      const client = createBrowserSupabaseClient();
      const [library, context] = await Promise.all([
        getClinicalDocumentTemplates(client, organizationId, type),
        // The context RPC guarantees the values come from the assigned encounter.
        getEncounterTemplateContext(client, encounterId),
      ]);
      if (!current) return;
      if (library.error || context.error) { setMessage("Published templates are unavailable for this encounter."); return; }
      const published = library.data.filter((template) => template.status === "published");
      contextRef.current = context.data.values;
      setTemplates(published);
      const defaultTemplate = published.find((template) => template.isDefault
        && template.conditionSystem === context.data.diagnosisSystem
        && template.conditionCode === context.data.diagnosisCode)
        ?? published.find((template) => template.isDefault && template.conditionDisplay === context.data.diagnosisDisplay)
        ?? null;
      setSelectedId(defaultTemplate?.id ?? "");
      setMessage(defaultTemplate ? `Suggested default: ${defaultTemplate.title}` : published.length ? "Choose a published starting template, or continue without one." : "No published templates match this document type.");
    }
    void load();
    return () => { current = false; };
  }, [encounterId, organizationId, type]);

  function apply() {
    const template = templates.find((item) => item.id === selectedId);
    if (!template) { onApply(null); setMessage("No template applied; continue with a free-text document."); return; }
    const values = contextRef.current;
    const medications = template.content.medications.map((line) => ({
      name: fillTemplate(line.name, values), dosage: fillTemplate(line.dosage, values),
      frequency: fillTemplate(line.frequency, values), duration: fillTemplate(line.duration, values), notes: fillTemplate(line.notes, values),
    }));
    onApply({ templateId: template.id, templateVersion: template.version, title: template.title, body: templateText(fillTemplate(template.content.html, values)), medications });
    setMessage(`${template.title} applied. You can edit every value before issuing.`);
  }

  return <section className="clinical-template-picker" aria-label={`${type === "prescription" ? "Prescription" : "Certificate"} template selection`}>
    <label>Starting template<select className="odyssey-input" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">No template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}{template.isDefault ? " — default" : ""}</option>)}</select></label>
    <Button type="button" size="sm" variant="outline" onClick={apply}>Apply template</Button>
    <p className="hint" aria-live="polite">{message}</p>
  </section>;
}
