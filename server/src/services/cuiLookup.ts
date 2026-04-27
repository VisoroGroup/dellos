/**
 * CUI Lookup (TypeScript port)
 *
 * ANAF nyilvanos PlatitorTvaRest v9 endpoint hasznalata.
 * Beirsz egy CIF-et, visszaad ceg adatokat (nev, cim, AFA-fizeto, regisztracios szam).
 * Nem kell hozza OAuth token.
 */

import axios from 'axios';

const ANAF_TVA_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

export interface CuiLookupResult {
    cui: number | string;
    denumire: string;
    adresa: string | null;
    localitate: string | null;
    judet: string | null;
    codPostal: string | null;
    nrRegCom: string | null;
    codCaen: string | null;
    formaJuridica: string | null;
    stareInregistrare: string | null;
    platitorTva: boolean;
    dataInceputTva: string | null;
    statusInactivi: boolean;
    dataInactivare: string | null;
    statusRoEfactura: boolean;
    telefon: string | null;
}

export async function lookupCui(cui: string | number): Promise<CuiLookupResult | null> {
    const cleanCui = String(cui).replace(/^RO/i, '').trim();
    if (!/^\d+$/.test(cleanCui)) {
        throw new Error('Ervenytelen CUI formatum');
    }

    const today = new Date().toISOString().slice(0, 10);
    const payload = [{ cui: parseInt(cleanCui, 10), data: today }];

    const response = await axios.post(ANAF_TVA_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
    });

    const data: any = response.data;
    const found = data.found?.[0];
    if (!found) {
        if (data.notFound && data.notFound.length > 0) return null;
        throw new Error(`ANAF valasz: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const general = found.date_generale || {};
    const tvaInfo = found.inregistrare_scop_Tva || {};
    const tvaPeriod = (tvaInfo.perioade_TVA && tvaInfo.perioade_TVA[0]) || {};
    const address = found.adresa_sediu_social || {};
    const inactiv = found.stare_inactiv || {};

    return {
        cui: general.cui,
        denumire: general.denumire,
        adresa: general.adresa || (address.sdenumire_Strada
            ? `${address.sdenumire_Strada} ${address.snumar_Strada || ''}`.trim()
            : null),
        localitate: address.sdenumire_Localitate || null,
        judet: address.sdenumire_Judet || null,
        codPostal: general.codPostal || address.scod_Postal || null,
        nrRegCom: general.nrRegCom || null,
        codCaen: general.cod_CAEN || null,
        formaJuridica: general.forma_juridica || null,
        stareInregistrare: general.stare_inregistrare || null,
        platitorTva: !!tvaInfo.scpTVA,
        dataInceputTva: tvaPeriod.data_inceput_ScpTVA || null,
        statusInactivi: !!inactiv.statusInactivi,
        dataInactivare: inactiv.dataInactivare || null,
        statusRoEfactura: !!general.statusRO_e_Factura,
        telefon: general.telefon || null,
    };
}
