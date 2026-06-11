'use client';

import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  BoldIcon,
  HeadingIcon,
  ItalicIcon,
  Link2Icon,
  Link2OffIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  RemoveFormattingIcon,
  StrikethroughIcon,
  Undo2Icon,
  UnderlineIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';

import { cn } from '@/lib/utils';

type Props = {
  /** Initial HTML content (controlled-on-mount, uncontrolled afterwards). */
  initialHtml?: string;
  /** Called whenever the document changes — debounced upstream if needed. */
  onChange?: (html: string, json: unknown) => void;
  /** Disable editing (still shows toolbar greyed-out). */
  disabled?: boolean;
  placeholder?: string;
  /** Min content height (px). */
  minHeight?: number;
};

/**
 * Éditeur de texte riche (Tiptap) avec une toolbar minimale orientée
 * documents légaux : titres, gras/italique/souligné/barré, listes, citation,
 * lien externe. Pas d'images, pas de tableaux, pas de code block — pour
 * rester lisible côté CGV/CGA.
 */
export function TiptapEditor({
  initialHtml,
  onChange,
  disabled,
  placeholder,
  minHeight = 300,
}: Props) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Empêche les sauts de paragraphe involontaires sur tab
        dropcursor: { width: 2 },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialHtml ?? '',
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          'min-h-[var(--tt-min-h)] px-3 py-3',
        ),
        style: `--tt-min-h: ${minHeight}px`,
        'aria-label': 'Éditeur de contenu',
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML(), editor.getJSON());
    },
  });

  // Si la prop disabled change après initialisation
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    return (
      <div
        className="rounded-md border bg-muted/30"
        style={{ minHeight: minHeight + 60 }}
        aria-busy="true"
      >
        <div className="h-10 border-b" />
        <div className="p-3 text-sm text-muted-foreground">Chargement de l’éditeur…</div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background">
      <Toolbar editor={editor} disabled={disabled ?? false} />
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

function ToolbarButton({
  onPressed,
  active,
  disabled,
  label,
  children,
}: {
  onPressed: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPressed}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        active && 'bg-muted text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const setLink = useCallback(() => {
    const url = window.prompt('URL du lien (https:// ou mailto:)');
    if (url === null) return; // annulation
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(url)) {
      window.alert('URL invalide. Doit commencer par https://, mailto: ou tel:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const buttons: Array<
    | {
        type: 'button';
        label: string;
        icon: React.ReactNode;
        onPressed: () => void;
        active: boolean;
      }
    | { type: 'separator' }
  > = [
    {
      type: 'button',
      label: 'Annuler',
      icon: <Undo2Icon className="size-4" />,
      onPressed: () => editor.chain().focus().undo().run(),
      active: false,
    },
    {
      type: 'button',
      label: 'Refaire',
      icon: <Redo2Icon className="size-4" />,
      onPressed: () => editor.chain().focus().redo().run(),
      active: false,
    },
    { type: 'separator' },
    {
      type: 'button',
      label: 'Titre 1',
      icon: (
        <span className="flex items-center gap-0.5">
          <HeadingIcon className="size-3.5" />
          <span className="text-[10px] font-semibold">1</span>
        </span>
      ),
      onPressed: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive('heading', { level: 1 }),
    },
    {
      type: 'button',
      label: 'Titre 2',
      icon: (
        <span className="flex items-center gap-0.5">
          <HeadingIcon className="size-3.5" />
          <span className="text-[10px] font-semibold">2</span>
        </span>
      ),
      onPressed: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive('heading', { level: 2 }),
    },
    {
      type: 'button',
      label: 'Titre 3',
      icon: (
        <span className="flex items-center gap-0.5">
          <HeadingIcon className="size-3.5" />
          <span className="text-[10px] font-semibold">3</span>
        </span>
      ),
      onPressed: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive('heading', { level: 3 }),
    },
    { type: 'separator' },
    {
      type: 'button',
      label: 'Gras',
      icon: <BoldIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      type: 'button',
      label: 'Italique',
      icon: <ItalicIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      type: 'button',
      label: 'Souligné',
      icon: <UnderlineIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleUnderline().run(),
      active: editor.isActive('underline'),
    },
    {
      type: 'button',
      label: 'Barré',
      icon: <StrikethroughIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleStrike().run(),
      active: editor.isActive('strike'),
    },
    { type: 'separator' },
    {
      type: 'button',
      label: 'Liste à puces',
      icon: <ListIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
    {
      type: 'button',
      label: 'Liste numérotée',
      icon: <ListOrderedIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList'),
    },
    {
      type: 'button',
      label: 'Citation',
      icon: <QuoteIcon className="size-4" />,
      onPressed: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
    },
    { type: 'separator' },
    {
      type: 'button',
      label: editor.isActive('link') ? 'Retirer le lien' : 'Ajouter un lien',
      icon: editor.isActive('link') ? (
        <Link2OffIcon className="size-4" />
      ) : (
        <Link2Icon className="size-4" />
      ),
      onPressed: setLink,
      active: editor.isActive('link'),
    },
    {
      type: 'button',
      label: 'Effacer la mise en forme',
      icon: <RemoveFormattingIcon className="size-4" />,
      onPressed: () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
      active: false,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1">
      {buttons.map((b, i) =>
        b.type === 'separator' ? (
          <span key={`sep-${i}`} className="mx-1 h-5 w-px bg-border" aria-hidden />
        ) : (
          <ToolbarButton
            key={b.label}
            label={b.label}
            onPressed={b.onPressed}
            active={b.active}
            disabled={disabled ?? false}
          >
            {b.icon}
          </ToolbarButton>
        ),
      )}
    </div>
  );
}
