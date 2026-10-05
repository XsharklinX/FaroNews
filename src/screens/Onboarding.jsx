// Primer arranque: el usuario elige qué le interesa y Faro le entrega un
// primer Hoy ya armado con los sitios recomendados de cada tema.

import { useState } from 'react';
import catalog from '../catalog/catalog.json';
import { actions, useStore } from '../data/store.js';
import { Logo } from '../ui/bits.jsx';

const NATIONAL = 'nacionales';

function guessCountry() {
    const region = (navigator.language || '').split('-')[1]?.toLowerCase();
    return catalog.countries.some((c) => c.id === region) ? region : catalog.countries[0].id;
}

export default function Onboarding() {
    const { settings } = useStore();
    const [picked, setPicked] = useState([]);
    const [country, setCountry] = useState(settings.country || guessCountry());
    const [working, setWorking] = useState(null);

    const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

    const entries = picked.flatMap((cat) => {
        const name = catalog.categories.find((c) => c.id === cat).name;
        return catalog.sources.filter((s) => s.cat === cat && s.top && (cat !== NATIONAL || s.country === country)).map((s) => ({ ...s, folder: name }));
    });

    const start = async () => {
        setWorking(entries.length);
        actions.setSettings({ country });
        await actions.followMany(entries, { quiet: true });
        actions.setSettings({ onboarded: true });
    };

    if (working !== null) {
        return (
            <div className="onb onb-wait">
                <span className="onb-lamp">
                    <Logo size={64} tower="#F4F7FB" beam="#FFC53D" />
                </span>
                <h1 className="title-l">Encendiendo el faro</h1>
                <p className="aldia-lede">Leyendo {working} sitios y eligiendo lo que vale la pena. Tarda unos segundos.</p>
            </div>
        );
    }

    return (
        <div className="onb">
            <div className="onb-top">
                <Logo size={44} tower="#F4F7FB" beam="#FFC53D" />
                <h1 className="title-l">¿Qué te interesa?</h1>
                <p className="aldia-lede">Elige unos cuantos temas. Faro sigue los mejores sitios de cada uno y te arma el primer Hoy.</p>
            </div>

            <div className="onb-grid">
                {catalog.categories.map((c) => (
                    <button key={c.id} type="button" className="onb-chip" aria-pressed={picked.includes(c.id)} onClick={() => toggle(c.id)}>
                        {c.name}
                    </button>
                ))}
            </div>

            {picked.includes(NATIONAL) && (
                <div className="block">
                    <h3 className="label onb-label">Nacionales de</h3>
                    <div className="chips">
                        {catalog.countries.map((c) => (
                            <button key={c.id} type="button" className="onb-chip small" aria-pressed={c.id === country} onClick={() => setCountry(c.id)}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="onb-foot">
                <button type="button" className="btn-lamp btn-big" disabled={!picked.length} onClick={start}>
                    {picked.length ? `Armar mi Hoy con ${entries.length} sitios` : 'Elige al menos un tema'}
                </button>
                <button type="button" className="night-link" onClick={() => actions.setSettings({ onboarded: true })}>
                    Prefiero añadir mis propios sitios
                </button>
            </div>
        </div>
    );
}
