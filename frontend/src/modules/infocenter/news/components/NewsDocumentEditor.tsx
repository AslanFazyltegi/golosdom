import { InfocenterRichTextEditor } from "../../shared/InfocenterRichTextEditor";

type Props = Parameters<typeof InfocenterRichTextEditor>[0];

export function NewsDocumentEditor({ value, onChange }: Props) {
  return <InfocenterRichTextEditor value={value} onChange={onChange} />;
}
