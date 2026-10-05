// Iconos de trazo, todos en una rejilla de 24. Toman el color del texto.

const PATHS = {
    hoy: (
        <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </>
    ),
    todo: <path d="M4 6h16M4 12h16M4 18h10" />,
    guardado: <path d="M6 4h12v17l-6-4-6 4z" />,
    fuentes: (
        <>
            <path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14" />
            <circle cx="6" cy="18" r="1.5" />
        </>
    ),
    atras: <path d="M15 5l-7 7 7 7" />,
    siguiente: <path d="M9 5l7 7-7 7" />,
    mas: <path d="M12 5v14M5 12h14" />,
    ok: <path d="M5 12l5 5 9-10" />,
    compartir: <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />,
    abrir: <path d="M14 5h5v5M19 5l-8 8M11 6H5v13h13v-6" />,
    actualizar: <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />,
    cerrar: <path d="M6 6l12 12M18 6L6 18" />,
    buscar: (
        <>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
        </>
    ),
    resaltar: <path d="M4 20h6M14 4l6 6-9 9H5v-6z" />,
    play: <path d="M8 5l11 7-11 7z" />,
    audio: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z" />,
    pausa: <path d="M7 5h3v14H7zM14 5h3v14h-3z" />,
    subir: <path d="M12 19V6M6 11l6-6 6 6" />,
    campana: <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />,
    ajustes: (
        <>
            <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
            <circle cx="16" cy="7" r="2.5" />
            <circle cx="8" cy="17" r="2.5" />
        </>
    ),
    explorar: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </>
    ),
    biblioteca: <path d="M6 4h12v17l-6-4-6 4z" />,
    documento: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
    enlace: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    silenciar: <path d="M4 9v6h4l5 4V5L8 9zM17 9.5l4 5M21 9.5l-4 5" />,
    destello: <path d="M12 3l2.2 6.3L20.5 12l-6.3 2.7L12 21l-2.2-6.3L3.5 12l6.3-2.7z" />,
    copia: <path d="M5 8h14v11H5zM4 4h16v4H4zM10 12h4" />,
    descarga: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
    grafico: <path d="M5 20V11M12 20V4M19 20v-6" />,
    gesto: <path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11M12 10.5V9a1.5 1.5 0 0 1 3 0v2.5M15 11.5a1.5 1.5 0 0 1 3 0V15a5.5 5.5 0 0 1-5.5 5.5h-.6a5.5 5.5 0 0 1-4.6-2.5L5 14a1.5 1.5 0 0 1 2.5-1.6L9 14.5" />,
    editar: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
};

export default function Icon({ name, size = 22, filled = false, strokeWidth = 2 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {PATHS[name]}
        </svg>
    );
}
