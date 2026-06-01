"use client";

import { Editor } from "@tinymce/tinymce-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
};

function fileToDataURL(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export function NewsDocumentEditor({ value, onChange }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Editor
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        licenseKey="gpl"
        value={value || ""}
        onEditorChange={(content) => onChange(content)}
        init={{
          height: 420,
          menubar: false,
          branding: false,
          promotion: false,
          base_url: "/tinymce",
          suffix: ".min",
          plugins: [
            "advlist",
            "autolink",
            "lists",
            "link",
            "image",
            "charmap",
            "preview",
            "anchor",
            "searchreplace",
            "visualblocks",
            "code",
            "fullscreen",
            "insertdatetime",
            "media",
            "table",
            "help",
            "wordcount",
          ],
          toolbar:
            "blocks fontfamily fontsize | " +
            "bold italic underline strikethrough superscript subscript | " +
            "alignleft aligncenter alignright alignjustify | " +
            "forecolor backcolor | " +
            "bullist numlist outdent indent blockquote | " +
            "table link unlink hr image fullscreen | " +
            "removeformat",
          block_formats:
            "Параграф=p; Заголовок 1=h1; Заголовок 2=h2; Заголовок 3=h3; Цитата=blockquote",
          font_family_formats:
            "Arial=arial,helvetica,sans-serif; Times New Roman=times new roman,times,serif; Courier New=courier new,courier,monospace; Georgia=georgia,palatino,serif; Verdana=verdana,geneva,sans-serif",
          font_size_formats: "10pt 12pt 14pt 16pt 18pt 24pt 36pt",
          automatic_uploads: true,
          file_picker_types: "image",
          images_upload_handler: async (blobInfo) => fileToDataURL(blobInfo.blob()),
          file_picker_callback: (callback, _value, meta) => {
            if (meta.filetype !== "image") return;

            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/jpeg,image/png,image/webp,image/gif";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              callback(await fileToDataURL(file), { alt: file.name, title: file.name });
            };
            input.click();
          },
          content_style: `
            body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 14pt;
              color: #0f172a;
              line-height: 1.7;
              padding: 16px;
            }
            h1, h2, h3 {
              font-weight: 700;
              line-height: 1.25;
              margin: 1rem 0 .5rem;
            }
            p {
              margin: 0 0 .75rem;
            }
            ul, ol {
              margin: .75rem 0;
              padding-left: 1.5rem;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            table td, table th {
              border: 1px solid #cbd5e1;
              padding: 8px;
            }
            a {
              color: #2563eb;
              text-decoration: underline;
            }
            blockquote {
              border-left: 4px solid #cbd5e1;
              padding-left: 12px;
              color: #475569;
              margin-left: 0;
            }
          `,
        }}
      />
    </div>
  );
}
