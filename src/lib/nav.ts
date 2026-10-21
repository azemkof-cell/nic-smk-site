export const NAV = [
  { href: '/stroitelnyj-kontrol', label: 'Стройконтроль' },
  { href: '/kontrol-monolita', label: 'Контроль монолита' },
  { href: '/laboratoriya', label: 'Лаборатория' },
  { href: '/elektrolaboratoriya', label: 'Электролаборатория' },
  { href: '/obsledovanie', label: 'Обследование' },
  { href: '/ceny', label: 'Цены' },
  { href: '/kontakty', label: 'Контакты' },
];

export const isActive = (path: string, href: string) => {
  const p = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (href === '/ceny') return p === '/ceny' || p.startsWith('/ceny/') || p === '/kalkulyator';
  return p === href;
};
