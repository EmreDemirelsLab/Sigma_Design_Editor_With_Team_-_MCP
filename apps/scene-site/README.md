# Sigma Scene Site

Parçacık sahneli, adım adım anlatan tek sayfa site çatısı. Premium yapay zekâ ve fintech sitelerindeki görsel dili (koyu zemin, kuzey ışığı lekeleri, dev ince başlık, cam butonlar, sahneye göre biçim değiştiren nokta bulutu) kendi kodumuzla üretir.

Canlı örnek: https://zengo.2-28-74-254.sslip.io

## Nasıl çalışır

- **Sahneler** üst üste durur; tekerlek, ok tuşları, kaydırma hareketi ya da düğmelerle bir sonrakine geçilir. Adres çubuğu `#3` gibi sahne numarasını tutar.
- **Parçacık motoru** (`src/particles/engine.ts`): tek bir Three.js `Points` nesnesi, yumuşak ışıyan nokta shader'ı, sahneler arası akıcı biçim değişimi, hafif "nefes", imleç şok dalgası.
- **Şekiller** (`src/particles/shapes.ts`): herhangi bir Lucide ikonu (1.900+), metin ya da hazır geometri (`enso`, `globe`, `galaxy`, `helix`, `wave`, `cube`, `torus`, `sphere`, `constellation`).
- **Performans**: masaüstünde 60.000, mobilde ya da zayıf işlemcide 22.000 parçacık; 90 sn hareketsizlikte ve sekme gizliyken uyur; kare hızından bağımsız; `prefers-reduced-motion` tercihinde statik.

## Yeni site yapmak

1. `src/scenes.ts` dosyasında `SITE` ve `SCENES` dizisini düzenleyin: metin, buton, `shape`, parçacık rengi, iki kuzey ışığı rengi.
2. `npm install && npm run dev` ile yerelde açın.
3. `npm run build` ile `dist/` üretin. Derleme öncesi yalnız kullanılan ikonlar ayıklanır (`scripts/icons.mjs`).

## Tek dosya sürümü

`standalone/zengo.template.html` aynı mantığın bağımlılıksız tek HTML hâlidir (Three.js CDN'den gelir). `node standalone/build.mjs` kullanılan ikonları gömüp `standalone/zengo.html` üretir; çift tıklayıp açmak yeterlidir.

## Yayınlama (VPS)

```bash
rsync -az --exclude node_modules --exclude dist ./ vps:/srv/zengo-site/
ssh vps 'cd /srv/zengo-site && docker compose -f deploy/compose.yaml up -d --build'
```

Traefik `zengo.2-28-74-254.sslip.io` için Let's Encrypt sertifikasını kendisi alır. Alan adını `deploy/compose.yaml` içindeki iki `Host(...)` kuralında değiştirin.
