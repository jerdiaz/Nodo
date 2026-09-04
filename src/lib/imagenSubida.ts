// Las imagenes que Nodo muestra tienen que haber pasado por /api/imagenes, que
// es donde se moderan con Vision y se recortan. Aceptar cualquier URL http(s)
// dejaba colar una alojada fuera: se salta la moderacion, puede cambiar de
// contenido despues de publicada -lo revisado y lo que se ve dejan de ser lo
// mismo- y convierte a cada visitante de la portada en una visita registrada
// en el servidor de quien la puso.
//
// Se compara el host ya interpretado por URL y no el principio de la cadena:
// "https://firebasestorage.googleapis.com.otro-sitio/" y
// "https://firebasestorage.googleapis.com@otro-sitio/" empiezan igual pero
// apuntan a otra parte.
export function esImagenSubida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.hostname === 'firebasestorage.googleapis.com';
  } catch {
    return false;
  }
}
