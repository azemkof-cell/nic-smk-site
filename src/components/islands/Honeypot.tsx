/** Скрытое поле-ловушка для ботов */
export default function Honeypot({ onValue }: { onValue: (v: string) => void }) {
  return (
    <div class="hp" aria-hidden="true">
      <label>
        Сайт
        <input type="text" name="website" tabIndex={-1} autoComplete="off" onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)} />
      </label>
    </div>
  );
}
