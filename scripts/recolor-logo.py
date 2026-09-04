"""Recolorea el isotipo de Nodo del verde esmeralda original al rojo de marca
(#ed2727, --marca-rojo / --c-acento en tema claro) y regenera los favicons
derivados.

No se usa un blend/tinte aproximado: #ed2727 tiene matiz H=0 exacto en HSV
(rojo puro, R=237 G=39=B=39), asi que retargetear el matiz de cada pixel a 0
se reduce a una formula cerrada sin trigonometria — el canal maximo original
pasa a ser R, los otros dos pasan a ser el canal minimo original. Saturacion
y valor (brillo) quedan intactos por construccion, asi que el sombreado y los
bordes suaves del isotipo se preservan pixel a pixel. El canal alfa no se
toca: la mascara/geometria queda exactamente igual.

Uso: python scripts/recolor-logo.py
"""

from PIL import Image
import numpy as np

MASTER_PATH = "public/logo-icon.png"


def recolor_to_brand_red(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.float32)
    alpha = arr[:, :, 3]

    maxc = rgb.max(axis=2)
    minc = rgb.min(axis=2)
    new_rgb = np.stack([maxc, minc, minc], axis=2).astype(np.uint8)

    return Image.fromarray(np.dstack([new_rgb, alpha]), mode="RGBA")


master = Image.open(MASTER_PATH).convert("RGBA")
recolored = recolor_to_brand_red(master)
recolored.save(MASTER_PATH)
print(f"recoloreado: {MASTER_PATH} ({recolored.size[0]}x{recolored.size[1]})")


def resized(size: int) -> Image.Image:
    return recolored.resize((size, size), Image.LANCZOS)


ico_sizes = [16, 32, 48]
ico_images = [resized(s) for s in ico_sizes]
ico_images[-1].save(
    "public/favicon.ico",
    format="ICO",
    sizes=[(s, s) for s in ico_sizes],
)

resized(32).save("public/favicon-32x32.png")
resized(180).save("public/favicon-180x180.png")

# apple-touch-icon: fondo solido. El tema por defecto del sitio es CLARO
# (--c-fondo: #ffffff), a diferencia del fondo oscuro que tenia cuando se
# genero este asset por primera vez, asi que el compuesto va sobre blanco.
bg = Image.new("RGBA", recolored.size, (255, 255, 255, 255))
apple = Image.alpha_composite(bg, recolored).resize((180, 180), Image.LANCZOS).convert("RGB")
apple.save("public/apple-touch-icon.png")

print("listo: favicon.ico, favicon-32x32.png, favicon-180x180.png, apple-touch-icon.png")
