// Enlaces escritos por la gente, para el perfil y para el evento.
//
// Casi nadie teclea "https://": escribe "funconceptos.org" y espera que
// funcione. Antes eso se rechazaba como invalido, que es exigirle al usuario
// que sepa como se escribe una URL para una maquina. Se le pone el esquema
// por el y se valida despues.

// new URL() acepta "javascript:alert(1)" como URL valida. Estos valores se
// pintan luego como href, asi que el protocolo se comprueba de forma explicita
// en vez de dar por buena cualquier URL parseable.
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Antepone https:// cuando no hay esquema. Solo cuando no hay ninguno: a
// "http://..." o a "mailto:..." no se les toca, que la validacion de despues
// diga lo suyo.
export function normalizeHttpUrl(value: string): string {
  const limpio = value.trim();

  if (!limpio || /^[a-z][a-z0-9+.-]*:/i.test(limpio)) {
    return limpio;
  }

  return `https://${limpio}`;
}
