// A donde se vuelve despues de iniciar sesion viaja en la URL (?destino=), asi
// que lo elige quien manda el enlace, no el sitio. Antes se seguia tal cual, y
// eso permitia dos cosas con un enlace preparado:
//
//   ?destino=https://otro-sitio/...   sacaba a la persona del sitio justo
//   despues de autenticarse, que es el momento en que menos se desconfia.
//
//   ?destino=javascript:...           se ejecutaba: asignar una URL javascript:
//   a location.href o location.replace corre ese codigo en nuestro origen y con
//   la sesion de quien pulsa (comprobado en Chromium).
//
// Por eso solo se acepta una ruta de este mismo sitio.
export const RUTA_POR_DEFECTO = '/eventos/nuevo';

export function rutaInterna(valor: string | null | undefined, porDefecto = RUTA_POR_DEFECTO): string {
  if (!valor) {
    return porDefecto;
  }

  // Una sola barra al principio y ni barra ni contrabarra en la segunda
  // posicion: asi caen "//otro-host", "/\otro-host" y cualquier esquema, que
  // no empieza por barra. La raiz se admite aparte porque no tiene segundo
  // caracter que mirar.
  return valor === '/' || /^\/[^/\\]/.test(valor) ? valor : porDefecto;
}
