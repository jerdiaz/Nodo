// Un campo de texto con lista desplegable: se puede escribir para filtrar o
// abrir y elegir. Es el patron del campo de ciudad de la cabecera, sacado a un
// sitio propio para que el formulario de eventos lo use dos veces (pais y
// ciudad) sin copiarlo otras dos.
//
// Solo se ocupa de la mecanica -pintar opciones, teclado, abrir y cerrar-. De
// donde salen las opciones y que pasa al elegir lo decide quien lo monta, que
// es lo unico que cambia entre un caso y otro.
//
// Es codigo de navegador: se importa desde <script> de componentes Astro, no
// desde el servidor.

export interface OpcionCombobox {
  valor: string;
  etiqueta: string;
  // Segunda linea, mas tenue: la region de una ciudad, por ejemplo.
  detalle?: string;
}

export interface ConfiguracionCombobox {
  input: HTMLInputElement;
  lista: HTMLElement;
  // Puede ser sincrono (una lista fija en memoria) o asincrono (una API).
  buscar: (texto: string) => OpcionCombobox[] | Promise<OpcionCombobox[]>;
  alElegir: (opcion: OpcionCombobox) => void;
  // Que decir cuando no hay nada que mostrar. Sin esto la lista se cierra.
  vacio?: (texto: string) => string | null;
  // Letras minimas antes de buscar. Cero abre la lista con solo enfocar, que
  // es lo que quiere una lista corta y fija como la de paises.
  minimo?: number;
  esperaMs?: number;
}

export interface Combobox {
  cerrar: () => void;
  // Vuelve a pedir las opciones con lo que haya escrito. Para cuando cambia
  // algo externo de lo que dependen (el pais de la ciudad).
  refrescar: () => void;
}

// Sin tildes ni mayusculas, la misma regla que usa el resto del sitio: quien
// escribe "bogota" tiene que encontrar "Bogotá". Se exporta para que quien
// monte una lista fija filtre con el mismo criterio.
export function claveDeBusqueda(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .trim();
}

export function montarCombobox(config: ConfiguracionCombobox): Combobox {
  const { input, lista, buscar, alElegir } = config;
  const minimo = config.minimo ?? 1;
  const esperaMs = config.esperaMs ?? 200;

  let opciones: OpcionCombobox[] = [];
  let activo = -1;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  // Numero de la ultima busqueda lanzada: una respuesta que llega tarde de
  // una busqueda anterior no debe pisar la lista de lo que se escribio despues.
  let secuencia = 0;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  lista.setAttribute('role', 'listbox');

  function cerrar(): void {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activo = -1;
  }

  function abrir(): void {
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function marcarActivo(): void {
    Array.from(lista.children).forEach((item, indice) => {
      const boton = item.firstElementChild as HTMLElement | null;
      const esActivo = indice === activo;
      boton?.classList.toggle('bg-fondo-alt', esActivo);
      item.setAttribute('aria-selected', String(esActivo));
    });
  }

  function elegir(opcion: OpcionCombobox): void {
    cerrar();
    alElegir(opcion);
  }

  function pintar(texto: string): void {
    lista.innerHTML = '';
    activo = -1;

    if (opciones.length === 0) {
      const mensaje = config.vacio?.(texto) ?? null;

      if (!mensaje) {
        cerrar();
        return;
      }

      const aviso = document.createElement('li');
      aviso.className = 'px-3 py-2.5 text-sm text-suave';
      aviso.textContent = mensaje;
      lista.appendChild(aviso);
      abrir();
      return;
    }

    for (const opcion of opciones) {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');

      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'block w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-fondo-alt';

      const principal = document.createElement('span');
      principal.className = 'block text-texto';
      principal.textContent = opcion.etiqueta;
      boton.appendChild(principal);

      if (opcion.detalle) {
        const secundario = document.createElement('span');
        secundario.className = 'block text-xs text-suave';
        secundario.textContent = opcion.detalle;
        boton.appendChild(secundario);
      }

      // mousedown y no click: el click llega despues del blur del input, y el
      // blur ya habria cerrado la lista antes de que el click encontrara nada.
      boton.addEventListener('mousedown', (evento) => {
        evento.preventDefault();
        elegir(opcion);
      });

      item.appendChild(boton);
      lista.appendChild(item);
    }

    // Con algo escrito, la primera opcion queda marcada: quien teclea "col" y
    // ve "Colombia" espera que Enter la elija, no que envie el formulario.
    // Con el campo vacio no se marca nada, porque abrir la lista entera y
    // pulsar Enter no es elegir a Argentina, es no haber elegido todavia.
    activo = claveDeBusqueda(texto) ? 0 : -1;
    marcarActivo();
    abrir();
  }

  async function consultar(): Promise<void> {
    const texto = input.value;

    if (claveDeBusqueda(texto).length < minimo) {
      opciones = [];
      cerrar();
      return;
    }

    const mia = ++secuencia;

    try {
      const resultado = await buscar(texto);
      if (mia !== secuencia) return;
      opciones = resultado;
    } catch {
      if (mia !== secuencia) return;
      opciones = [];
    }

    pintar(texto);
  }

  function programar(): void {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void consultar(), esperaMs);
  }

  input.addEventListener('input', programar);
  input.addEventListener('focus', () => void consultar());

  input.addEventListener('keydown', (evento) => {
    if (lista.hidden) {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        void consultar();
      }
      return;
    }

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      activo = Math.min(activo + 1, opciones.length - 1);
      marcarActivo();
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      activo = Math.max(activo - 1, 0);
      marcarActivo();
    } else if (evento.key === 'Enter') {
      const opcion = opciones[activo];
      if (opcion) {
        // Solo se intercepta Enter cuando hay una opcion marcada: sin marcar,
        // Enter sigue enviando el formulario como en cualquier campo.
        evento.preventDefault();
        elegir(opcion);
      }
    } else if (evento.key === 'Escape') {
      cerrar();
    }
  });

  input.addEventListener('blur', () => {
    // Un respiro para que el mousedown de una opcion llegue antes del cierre.
    setTimeout(cerrar, 120);
  });

  return { cerrar, refrescar: () => void consultar() };
}
