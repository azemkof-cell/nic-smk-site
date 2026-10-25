interface Props {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
}

/** Отдельный чекбокс согласия на обработку ПДн (152-ФЗ в ред. 156-ФЗ) */
export default function Consent({ id, checked, onChange, invalid }: Props) {
  return (
    <div>
      <label class={'consent' + (invalid ? ' consent--invalid' : '')} for={id}>
        <input id={id} type="checkbox" checked={checked} required aria-invalid={invalid ? 'true' : undefined} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
        <span>
          Даю <a href="/personalnye-dannye#soglasie">согласие на обработку персональных данных</a> и подтверждаю, что ознакомлен(а) с <a href="/personalnye-dannye#politika">политикой обработки</a>.
        </span>
      </label>
      {invalid && (
        <div class="err" role="alert" style="margin-top:4px">
          Без согласия не сможем принять заявку. Отметьте поле.
        </div>
      )}
    </div>
  );
}
