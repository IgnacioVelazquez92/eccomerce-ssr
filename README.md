# 🛒 E-Commerce Express + Handlebars + MongoDB

**Proyecto académico (6 integrantes / 6 módulos)**

> **Propósito:** visión general (alto nivel) con arquitectura, flujos, responsabilidades y mapas.

---

## 1) Visión General

- **Qué es:** un e-commerce académico modular, diseñado para cubrir los requerimientos clave de un entorno real pero con complejidad controlada.
- **Stack:** Node.js (Express), Handlebars, Bootstrap 5, MongoDB Atlas (Mongoose), Mercado Pago (sandbox), Cloudinary (imágenes), Sessions (connect-mongo), Nodemailer (emails), bcrypt, dotenv, morgan, helmet.
- **Requerimientos académicos mínimos:**
  - **CRUD:** Usuarios, Productos y Categorías.
  - **Auth:** Login / Logout, roles `user` y `admin`.
  - **Admin:** panel con gestión de usuarios, productos, pedidos y categorías.
  - **Compra:** Carrito + Checkout con **Mercado Pago (sandbox)**.
  - **Medios:** Imágenes a **Cloudinary**.
  - **Notificaciones:** Emails con **Nodemailer** (confirmaciones, órdenes, etc).

**Funcionalidad Clave (UI con Bootstrap)**

- El objetivo principal de este proyecto es la **funcionalidad** (lógica de Express, Mongoose, integración de servicios) y el cumplimiento de los flujos académicos requeridos.

- La interfaz de usuario (UI) se resuelve íntegramente con **componentes estándar de Bootstrap 5** (formularios, modales, tablas, cards). Se prioriza la lógica de negocio sobre el diseño visual; no se requiere CSS personalizado, delegando la capa de presentación a Bootstrap.

## 2) Estructura de carpetas

> `views/` y `controllers/` están organizados por módulo (autonomía por equipo).  
> Los helpers, layouts y partials son compartidos.

```
ecommerce/
├─ package.json
├─ .env
├─ README.md
├─ public/
│  ├─ css/bootstrap.min.css
│  ├─ js/bootstrap.bundle.min.js
│  └─ img/logo.png
└─ src/
   ├─ server/server.js
   ├─ config/
   │  ├─ env.js
   │  ├─ db.js
   │  └─ cloudinary.js
   ├─ middlewares/
   │  ├─ auth.js              # requireAuth, requireAdmin, setUserInViews
   │  └─ errors.js            # asyncHandler, manejo global
   ├─ models/
   │  ├─ User.js
   │  ├─ Product.js           # + descripción, ficha técnica y categoría
   │  ├─ Category.js          # + slug automático, active flag
   │  └─ Order.js
   ├─ services/
   │  ├─ mp.service.js
   │  ├─ image.service.js
   │  └─ cart.service.js
   ├─ controllers/
   │  ├─ auth.controller.js
   │  ├─ account.controller.js
   │  ├─ product.controller.js   # CRUD + Cloudinary + categorías
   │  ├─ category.controller.js  # CRUD + returnTo
   │  ├─ order.controller.js
   │  └─ admin.controller.js
   ├─ routes/
   │  ├─ index.js
   │  ├─ auth.js
   │  ├─ account.js
   │  ├─ products.js            # público + detalle
   │  ├─ cart.js
   │  ├─ checkout.js
   │  └─ admin/
   │     ├─ products.js
   │     ├─ categories.js
   │     ├─ users.js
   │     └─ orders.js
   └─ views/
      ├─ layouts/main.hbs
      ├─ partials/... (navbar, sidebar, flash, product-card)
      ├─ auth/... (login, register, profile)
      ├─ admin/... (users, products)
      ├─ categories/... (form)
      ├─ products/... (list, form, detail)
      ├─ cart/... (cart, summary)
      ├─ checkout/... (checkout, success, failure)
      └─ shared/... (home)
```

---

## 3) Arquitectura general

```mermaid
flowchart LR
  U[Usuario / Admin] --> R[Express Router]
  R --> C[Controllers]
  C --> M[Mongoose Models]
  M --> DB[(MongoDB Atlas)]
  C --> V[Handlebars Views]
  V --> B[Bootstrap + JS + Helpers]
  C --> CLD((Cloudinary))
  C --> MP((Mercado Pago))
  C --> NL((Nodemailer))
```

---

## 4) Diagrama ER (conceptual)

```mermaid
erDiagram
  USER ||--o{ ORDER : "realiza"
  USER ||--o{ ADDRESS : "tiene"
  CATEGORY ||--o{ PRODUCT : "agrupa"

  USER {
    string _id PK
    string name
    string email UK
    string passwordHash
    string role "user|admin"
    string phone
    boolean active
    date createdAt
  }

  ADDRESS {
    string _id PK
    string userId FK
    string label
    string line1
    string city
    string state
    string zip
  }

  CATEGORY {
    string _id PK
    string name
    string slug
    boolean active
  }

  PRODUCT {
    string _id PK
    string title
    string sku UK
    number price
    number stock
    string description
    string[] techSpecs
    string imageUrl
    string imagePublicId
    ObjectId categoryId FK
    string categoryName
    boolean active
    boolean featured
    boolean promoEnabled
    number promoPct
    date createdAt
  }

  ORDER ||--o{ ORDER_ITEM : "contiene"
  ORDER {
    string _id PK
    string userId FK
    number subtotal
    number total
    string status
    string shippingMethod
    object shipping
    string mpPreferenceId
    date createdAt
  }

  ORDER_ITEM {
    string _id PK
    string orderId FK
    string productId FK
    string title
    number price
    number qty
  }
```

---

## 5) Flujos principales

### 5.1. Alta de producto (con imagen y categoría)

```mermaid
sequenceDiagram
  participant A as Admin
  participant R as /admin/products (POST)
  participant S as image.service
  participant DB as MongoDB

  A->>R: Form (title, description, categoryId, techSpecs, file)
  R->>S: uploadImage(file)
  S-->>R: imageUrl + imagePublicId
  R->>DB: Product.create({...})
  DB-->>R: OK
  R-->>A: Redirect /admin/products
```

### 5.2. Creación de categoría desde el modal

```mermaid
sequenceDiagram
  participant A as Admin (Form Producto)
  participant M as Modal Categorías
  participant R as /admin/categories?returnTo=<url>
  participant DB as MongoDB

  A->>M: + Nueva Categoría
  M->>R: POST /admin/categories + returnTo
  R->>DB: Category.create()
  DB-->>R: OK
  R-->>A: Redirect returnTo → vuelve al form original
```

### 5.3. Catálogo → Detalle → Carrito

```mermaid
sequenceDiagram
  U->>S: GET /
  S->>DB: Productos activos + filtros
  S-->>U: Render list.hbs

  U->>S: GET /products/:id
  S->>DB: Producto + descripción + techSpecs
  S-->>U: Render detail.hbs

  U->>S: POST /cart/add/:id
  S->>Session: addItem(productId, qty)
  S-->>U: Redirect /cart
```

---

## 6) Consideraciones y UX

- **Formulario de producto:**
  - Crea categorías al vuelo sin salir del form (modal Bootstrap).
  - Previsualiza imagen nueva antes de subirla.
  - Guarda ficha técnica separada por líneas (`textarea → array`).

- **Vista pública (`detail.hbs`):**
  - Muestra categoría, descripción y ficha técnica.
  - Control de stock y botón “Agregar al carrito”.

- **Cloudinary:**
  - Subida, reemplazo y borrado sincronizado.
  - Carpeta fija `ecommerce/products/`.

- **Helmet CSP:**
  - Permite `https://res.cloudinary.com` y `blob:`.
  - Scripts inline con `nonce`.

- **Middleware admin:**
  - Protege rutas `/admin/*` y `/admin/categories`.

---

## 7) Dependencias entre módulos

| Módulo                    | Función principal              | Relación                         |
| :------------------------ | :----------------------------- | :------------------------------- |
| **1. Usuarios**           | Auth + roles                   | `requireAdmin`, `setUserInViews` |
| **2. Productos**          | CRUD + Cloudinary + Categorías | núcleo del catálogo              |
| **3. Catálogo y Carrito** | Productos activos + sesión     | usa datos del módulo 2           |
| **4. Checkout (MP)**      | Pagos sandbox                  | usa órdenes y productos          |
| **5. Admin Dashboard**    | KPIs + pedidos                 | consolida todo                   |
| **6. Seeds y Deploy**     | Datos demo + Render            | inicialización                   |

---

## 6) División en 6 Módulos

### MÓDULO 1 — Infra + Autenticación/Usuarios (CRUD + Perfil unificado)

**Responsable:** _pendiente_  
**Alcance general:** infraestructura Express, sesiones, autenticación (login/logout), CRUD de usuarios (solo administradores) y **perfil unificado del usuario** (`/account/profile`) con edición de teléfono y direcciones.

---

#### 🧱 Responsabilidad general

Implementar la **infraestructura base** del proyecto (Express + Handlebars + MongoDB + sesiones) y habilitar el sistema de **autenticación** con registro, login, logout y roles básicos (`user`, `admin`).

El módulo incluye:

- **Flujo de autenticación** completo.
- **CRUD de usuarios** accesible solo por administradores.
- **Perfil unificado del usuario** con edición de teléfono y direcciones desde una única vista.

---

#### 📂 Archivos y carpetas implicadas

```
ecommerce/
├─ .env.example                   # PORT, NODE_ENV, MONGO_URI, SESSION_SECRET
└─ src/
   ├─ server/
   │  └─ server.js               # Arranque Express, Handlebars, sesiones, rutas base
   │
   ├─ config/
   │  ├─ env.js                  # Carga .env + validaciones mínimas
   │  └─ db.js                   # Conexión a MongoDB (Mongoose)
   │
   ├─ middlewares/
   │  ├─ auth.js                 # requireAuth, requireAdmin, setUserInViews
   │  └─ errors.js               # 404/500 y asyncHandler
   │
   ├─ models/
   │  └─ User.js                 # Esquema usuario: email único, hash, rol, activo,
   │                             # teléfono, direcciones y dirección por defecto
   │
   ├─ controllers/
   │  ├─ auth.controller.js      # Registro, login, logout
   │  ├─ admin.controller.js     # CRUD de usuarios (solo admin)
   │  └─ account.controller.js   # Perfil unificado (ver/editar teléfono y direcciones)
   │
   ├─ routes/
   │  ├─ auth.js                 # /login /register /logout
   │  ├─ account.js              # /account/profile y subrutas para edición de datos
   │  └─ admin/users.js          # CRUD de usuarios (protegidas requireAdmin)
   │
   └─ views/
      ├─ auth/                   # Vistas del módulo de autenticación
      │  ├─ login.hbs            # Form login
      │  ├─ register.hbs         # Form registro
      │  └─ profile.hbs          # Perfil unificado (datos + teléfono + direcciones)
      │
      ├─ admin/                  # Vistas del panel admin (usuarios)
      │  └─ users.hbs            # Tabla + formularios CRUD usuarios
      │
      ├─ layouts/
      │  └─ main.hbs             # Layout base (navbar, footer, flash)
      │
      └─ partials/
         ├─ navbar.hbs           # Incluye enlace a /account/profile si hay sesión
         ├─ footer.hbs
         └─ flash.hbs
```

> Las vistas se agrupan por módulo (`views/auth`, `views/admin`, etc.) para aislar equipos y mantener coherencia.  
> Los layouts y partials permanecen globales.

---

#### 🧩 Modelo base actualizado

```mermaid
erDiagram
  USER {
    string _id PK
    string name
    string email UK
    string passwordHash
    string role "user|admin"
    boolean active
    string phone
    object[] addresses "Subdocumentos Address"
    objectId defaultAddressId "ID de dirección preferida"
    date createdAt
  }

  ADDRESS {
    string label "Etiqueta opcional (Casa, Trabajo)"
    string line1 "Calle y número"
    string line2 "Piso o Dto (opcional)"
    string city
    string state
    string zip
  }

  USER ||--o{ ADDRESS : "contiene"
```

---

#### 🔄 Flujos principales

**Autenticación y registro**

```mermaid
sequenceDiagram
  participant U as Usuario
  participant S as Servidor
  participant DB as MongoDB

  U->>S: POST /login (email, password)
  S->>DB: findOne(email)
  DB-->>S: user|null
  S-->>U: Éxito → sesión → redirect / | Error → volver a login

  U->>S: POST /register (name, email, password)
  S->>DB: valida email único + crea user
  S-->>U: redirect /login
```

**Perfil unificado (/account/profile)**

```mermaid
graph TD
  A["GET /account/profile"] --> B{"requireAuth"}
  B --> N1["No"] --> C["Redirect /login"]
  B --> S1["Sí"] --> D["Render auth/profile.hbs"]

  D --> E["Form Teléfono → POST /account/profile/phone"]
  D --> F["Form Nueva dirección → POST /account/profile/addresses"]
  D --> G["Botón Preferida → POST /account/profile/addresses/:id/default"]
  D --> H["Botón Eliminar → POST /account/profile/addresses/:id/delete"]
```

**Acceso al panel admin (usuarios)**

```mermaid
graph TD
  A2["GET /admin/users"] --> B2{"requireAuth"}
  B2 --> N2["No"] --> C2["Redirect /login"]
  B2 --> S2["Sí"] --> D2{"role == 'admin'?"}
  D2 --> N3["No"] --> E2["Redirect /"]
  D2 --> S3["Sí"] --> F2["Render admin/users.hbs"]
```

---

#### 🧭 Rutas del módulo

| Método | Ruta                                     | Descripción                     | Auth    |
| -----: | ---------------------------------------- | ------------------------------- | ------- |
|    GET | `/login`                                 | Form login                      | Público |
|   POST | `/login`                                 | Autenticar                      | Público |
|    GET | `/register`                              | Form registro                   | Público |
|   POST | `/register`                              | Crear usuario                   | Público |
|    GET | `/logout`                                | Cerrar sesión                   | Usuario |
|    GET | `/account/profile`                       | Ver perfil unificado            | Usuario |
|   POST | `/account/profile/phone`                 | Actualizar teléfono             | Usuario |
|   POST | `/account/profile/addresses`             | Agregar dirección               | Usuario |
|   POST | `/account/profile/addresses/:id/default` | Marcar dirección como preferida | Usuario |
|   POST | `/account/profile/addresses/:id/delete`  | Eliminar dirección              | Usuario |
|    GET | `/admin/users`                           | Listar usuarios                 | Admin   |
|   POST | `/admin/users`                           | Crear usuario                   | Admin   |
|   POST | `/admin/users/:id/update`                | Actualizar usuario              | Admin   |
|   POST | `/admin/users/:id/toggle`                | Activar/Desactivar              | Admin   |

---

#### ⚙️ Variables de entorno mínimas

```
PORT=3000
NODE_ENV=development
MONGO_URI="mongodb+srv://.../dbname"
SESSION_SECRET="cambia-esto"
BCRYPT_SALT_ROUNDS=10
```

---

#### 🔗 Interfaces con otros módulos

- Expone `req.session` y `res.locals.user` a todo el sistema.
- Provee los middlewares `requireAuth` y `requireAdmin` usados en módulos posteriores.
- Gestiona toda la edición del usuario logueado desde un único punto `/account/profile`.
- Es prerequisito de los flujos de carrito, checkout y administración.
- No debe confundirse con el **dashboard admin** del Módulo 5 (este módulo solo gestiona autenticación y usuarios).

---

#### ✅ Estado actual

| Área                    | Estado | Detalle breve                                  |
| ----------------------- | ------ | ---------------------------------------------- |
| Infraestructura Express | ✅     | Base estable (dotenv, sesiones, Handlebars)    |
| Modelo de usuario       | ✅     | Teléfono + direcciones + helpers de instancia  |
| Autenticación           | ✅     | Login, logout, registro, roles                 |
| CRUD admin usuarios     | ✅     | Listar, crear, activar/desactivar (solo admin) |
| Perfil unificado        | ✅     | `/account/profile` — edición centralizada      |
| Documentación           | ✅     | Completa y actualizada                         |

---

### MÓDULO 2 — Productos (CRUD) + Cloudinary + Categorías

**Responsable:** _pendiente_  
**Alcance general:** CRUD completo de productos y categorías para administradores, con subida, reemplazo y borrado de imágenes en **Cloudinary**, descripción breve, ficha técnica y relación con categorías dinámicas gestionables desde el mismo formulario.

---

#### 🧱 Responsabilidad general

Gestionar el **ciclo de vida de productos** en el panel administrativo:

- **Altas, ediciones, activaciones, stock, promos y categorías.**
- **Subida segura de imágenes a Cloudinary.**
- Campos enriquecidos: descripción breve y ficha técnica (array de strings).
- Gestión de **categorías** desde un modal sin salir del formulario.

> El catálogo público y el carrito se documentan en el **Módulo 3 (Catálogo + Carrito)**.

---

#### 📂 Archivos y carpetas implicadas

```
ecommerce/
└─ src/
   ├─ config/
   │  └─ cloudinary.js            # Inicializa el SDK Cloudinary
   │
   ├─ services/
   │  └─ image.service.js         # Subida, reemplazo y borrado en Cloudinary
   │
   ├─ models/
   │  ├─ Product.js               # Esquema Mongoose del producto
   │  └─ Category.js              # Nuevo esquema de categorías
   │
   ├─ controllers/
   │  ├─ product.controller.js    # Acciones CRUD admin + manejo de imagen
   │  └─ category.controller.js   # CRUD completo con soporte returnTo
   │
   ├─ routes/
   │  ├─ admin/products.js        # Rutas CRUD protegidas con requireAdmin
   │  └─ admin/categories.js      # Rutas CRUD de categorías
   │
   └─ views/
      ├─ admin/
      │  └─ products.hbs          # Listado, búsqueda, toggles y paginación
      │
      ├─ categories/
      │  └─ form.hbs              # Formulario de alta/edición de categoría
      │
      └─ products/
         ├─ form.hbs              # Formulario de producto con modal de categorías
         └─ detail.hbs            # Vista pública con descripción y ficha técnica
```

> Los middlewares `requireAdmin` y `asyncHandler` provienen del **Módulo 1 (Usuarios)**.  
> Las vistas utilizan el layout global `layouts/main.hbs` y **Bootstrap 5**.  
> Helmet gestiona la CSP para Cloudinary y scripts inline con `nonce`.

---

#### 🧩 Modelos

##### Product.js

```mermaid
erDiagram
  PRODUCT {
    string _id PK
    string title
    string sku UK
    number price
    number stock
    boolean active
    boolean featured
    boolean promoEnabled
    number promoPct
    string description
    string[] techSpecs
    string imageUrl
    string imagePublicId
    ObjectId categoryId FK
    string categoryName
    date createdAt
    date updatedAt
  }
```

##### Category.js

```mermaid
erDiagram
  CATEGORY {
    string _id PK
    string name UK
    string slug
    boolean active
    date createdAt
    date updatedAt
  }
  CATEGORY ||--o{ PRODUCT : "categoryId"
```

---

#### 🧩 Campos agregados recientemente

| Campo          | Tipo       | Descripción                                          |
| :------------- | :--------- | :--------------------------------------------------- |
| `description`  | `String`   | Descripción breve o resumen técnico del producto.    |
| `techSpecs`    | `String[]` | Lista de características (una por línea en el form). |
| `categoryId`   | `ObjectId` | Referencia a `Category`.                             |
| `categoryName` | `String`   | Denormalizado para lecturas rápidas en el catálogo.  |

---

#### 🧩 Novedades funcionales

1. **Gestión de categorías**
   - Modelo `Category` con `name`, `slug`, `active`.
   - CRUD completo bajo `/admin/categories`.
   - Form de producto incluye **modal Bootstrap** para crear categorías al vuelo.
   - Soporta `returnTo`: si creás una categoría desde el modal, vuelve al producto automáticamente.

2. **Campos descriptivos**
   - `description` (texto libre).
   - `techSpecs` (array de strings, mostrados en `detail.hbs` como `<ul>`).

3. **Vista pública extendida**
   - `detail.hbs` muestra imagen, descripción, ficha técnica, categoría, stock y precio promo si aplica.

4. **Controller extendido**
   - `product.controller.js` maneja `description`, `techSpecs` y `categoryId` en `collectProductPayload()`.
   - Incluye `renderNewForm`, `renderEditForm` con `categories` precargadas.
   - `detail()` amplió la proyección (`description`, `techSpecs`, `categoryName`).

---

#### 🔄 Flujos principales (admin)

**Creación con categoría y descripción**

```mermaid
sequenceDiagram
  participant A as Admin
  participant R as /admin/products (POST)
  participant S as image.service
  participant DB as MongoDB

  A->>R: Form data (title, categoryId, description, techSpecs[], file)
  R->>S: upload(file)
  S-->>R: imageUrl, imagePublicId
  R->>DB: create(Product + relaciones)
  DB-->>R: OK
  R-->>A: Redirect /admin/products
```

**Creación de categoría dentro del modal**

```mermaid
sequenceDiagram
  participant A as Admin (form product)
  participant M as Modal Categorías
  participant R as /admin/categories?returnTo=<url>
  participant DB as MongoDB

  A->>M: Abre modal → completa nombre
  M->>R: POST /admin/categories + returnTo
  R->>DB: Category.create()
  DB-->>R: OK
  R-->>A: Redirect returnTo → vuelve al formulario de producto
```

---

#### 🧭 Rutas principales

##### Productos

| Método | Ruta                               | Descripción                               | Auth  |
| :----- | :--------------------------------- | :---------------------------------------- | :---- |
| GET    | `/admin/products`                  | Listar productos (búsqueda/paginado)      | Admin |
| GET    | `/admin/products/new`              | Formulario de alta                        | Admin |
| POST   | `/admin/products`                  | Crear producto (Cloudinary + categoría)   | Admin |
| GET    | `/admin/products/:id/edit`         | Formulario de edición                     | Admin |
| POST   | `/admin/products/:id`              | Actualizar producto (reemplazo de imagen) | Admin |
| POST   | `/admin/products/:id/toggle/:flag` | Cambiar flag (active, featured, promo)    | Admin |
| POST   | `/admin/products/:id/delete`       | Eliminar producto + imagen                | Admin |

##### Categorías

| Método | Ruta                           | Descripción              | Auth  |
| :----- | :----------------------------- | :----------------------- | :---- |
| GET    | `/admin/categories`            | Listar categorías        | Admin |
| GET    | `/admin/categories/new`        | Formulario de alta       | Admin |
| POST   | `/admin/categories`            | Crear (soporta returnTo) | Admin |
| GET    | `/admin/categories/:id/edit`   | Editar categoría         | Admin |
| POST   | `/admin/categories/:id`        | Actualizar categoría     | Admin |
| POST   | `/admin/categories/:id/toggle` | Activar/desactivar       | Admin |
| POST   | `/admin/categories/:id/delete` | Eliminar                 | Admin |

---

#### ⚙️ Variables de entorno

```
# Cloudinary
CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
# o equivalente:
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

---

#### 🧠 Integraciones técnicas clave

**1. Cloudinary**

- Se usa `f_auto,q_auto` para optimización automática.
- Carpeta fija `ecommerce/products/`.
- Validación de tipo y tamaño (máx 2 MB).

**2. Helmet + CSP**

- Permite imágenes de `res.cloudinary.com` y `blob:`.
- Scripts inline solo con `nonce="{{cspNonce}}"`.

**3. UX/UI**

- Formulario con previsualización instantánea.
- Modal de categorías sin abandonar la página.
- Recarga automática tras crear categoría (por `returnTo`).
- Pagos, carrito y favoritos gestionados en módulos posteriores.

---

#### 🧭 Vista pública (detalle del producto)

```mermaid
graph TD
  A["/products/:id"] --> B["Consulta producto activo"]
  B --> C["DecoratePromoFields"]
  C --> D["Render detail.hbs"]
  D --> E["Muestra descripción y ficha técnica"]
```

**Campos visibles:**

- Imagen Cloudinary
- Nombre, SKU, categoría
- Precio con o sin promoción
- Descripción breve
- Ficha técnica (lista de características)
- Control de stock y botón “Agregar al carrito”

---

### MÓDULO 3 — Catálogo Público + Carrito (en sesión)

**Responsable:** _pendiente_  
**Alcance general:** publicar el **catálogo de productos activos** y gestionar un **carrito persistido en sesión**, aplicando promociones simples (`promoEnabled`, `promoPct`), totales y cantidad.  
El flujo de pago con Mercado Pago (sandbox) se desarrolla en el **Módulo 4**.

---

#### 🧱 Responsabilidad general

Este módulo permite que cualquier visitante:

1. Navegue el **catálogo público** con filtros y vistas amigables.
2. Consulte el **detalle del producto**, con descripción y ficha técnica.
3. **Agregue productos al carrito**, ajuste cantidades o los elimine.
4. Mantenga el carrito en sesión (sin login obligatorio).

> El carrito no se guarda en la base de datos, solo en `req.session.cart`.

---

#### 📂 Archivos y carpetas implicadas

```
ecommerce/
└─ src/
   ├─ services/
   │  └─ cart.service.js         # Lógica de carrito: add, remove, qty, total, promos
   │
   ├─ controllers/
   │  ├─ catalog.controller.js   # Catálogo público (listado + detalle)
   │  └─ cart.controller.js      # Agregar, quitar, actualizar carrito
   │
   ├─ routes/
   │  ├─ catalog.js              # /  y  /products/:id
   │  └─ cart.js                 # /cart + acciones POST
   │
   └─ views/
      ├─ catalog/
      │  ├─ index.hbs            # Home con cards, filtros, promos
      │  └─ detail.hbs           # Detalle con descripción y ficha técnica
      └─ cart/
         ├─ index.hbs            # Vista principal del carrito
         └─ empty.hbs            # Carrito vacío
```

---

#### 🧩 Modelo de datos (reutilizado del módulo 2)

```mermaid
erDiagram
  PRODUCT {
    string _id PK
    string title
    string sku
    number price
    number stock
    string description
    string[] techSpecs
    boolean active
    boolean promoEnabled
    number promoPct
    string imageUrl
    string categoryName
  }
```

El carrito no se almacena en MongoDB, sino en `req.session.cart`:

```js
req.session.cart = {
  items: [
    {
      productId,
      title,
      price,
      qty,
      subtotal,
      promoApplied: true | false,
    },
  ],
  subtotal,
  total,
  totalItems,
};
```

---

#### 🔄 Flujos principales

##### 1️⃣ Catálogo → Detalle → Carrito

```mermaid
sequenceDiagram
  participant U as Usuario
  participant S as Servidor
  participant DB as MongoDB
  participant Sess as req.session.cart

  U->>S: GET /
  S->>DB: Buscar productos {active:true}
  DB-->>S: Lista de productos
  S-->>U: Render catalog/index.hbs (cards + filtros)

  U->>S: GET /products/:id
  S->>DB: Buscar producto + descripción + ficha técnica
  DB-->>S: Producto
  S-->>U: Render catalog/detail.hbs

  U->>S: POST /cart/add/:id (qty)
  S->>DB: Validar stock
  S->>Sess: addItem(product, qty)
  Sess-->>S: Actualizado
  S-->>U: Redirect /cart

  U->>S: GET /cart
  S->>Sess: leer carrito
  Sess-->>S: Totales
  S-->>U: Render cart/index.hbs
```

---

##### 2️⃣ Cálculo de totales (cart.service.js)

```mermaid
graph TD
  A["addItem(product, qty)"] --> B["calcular subtotal"]
  B --> C{"promoEnabled?"}
  C -->|Sí| D["aplica promoPct sobre price"]
  C -->|No| E["usa price normal"]
  D --> F["actualiza total carrito"]
  E --> F
  F --> G["devuelve subtotal + total + count"]
```

---

#### ⚙️ Funcionalidades clave

##### 🧮 Lógica de carrito (`cart.service.js`)

- `addItem(cart, product, qty)`: agrega o suma cantidad.
- `updateQty(cart, productId, qty)`: actualiza cantidad (no excede stock).
- `removeItem(cart, productId)`: elimina el ítem.
- `calculateTotals(cart)`: recalcula subtotal, descuentos y total.

> Aplica automáticamente `promoPct` si `promoEnabled === true`.

---

##### 🧠 Controladores

#### `catalog.controller.js`

- `listProducts(req, res)`
  - Filtra por texto o categoría.
  - Solo muestra `active: true`.
- `showProduct(req, res)`
  - Renderiza vista de detalle con descripción y ficha técnica.

#### `cart.controller.js`

- `viewCart(req, res)`
  - Renderiza `cart/index.hbs` o `cart/empty.hbs`.
- `addToCart(req, res)`
  - Busca producto, valida stock y agrega a sesión.
- `updateQty(req, res)`
  - Modifica cantidad y recalcula totales.
- `removeFromCart(req, res)`
  - Elimina producto del carrito.
- `clearCart(req, res)`
  - Limpia `req.session.cart`.

---

#### 🎨 Vistas Handlebars

##### 🏠 `catalog/index.hbs`

- Cards Bootstrap responsive.
- Muestra:
  - Imagen
  - Precio actual o promocional
  - Badge “Promo” si aplica
  - Botón “Agregar al carrito”
- Filtros por texto y rango de precios.

##### 📄 `catalog/detail.hbs`

- Imagen ampliada.
- Precio, promo, stock y descripción.
- Ficha técnica como lista `<ul>`.
- Botón “Agregar al carrito”.

##### 🛒 `cart/index.hbs`

- Tabla con productos, cantidad editable, subtotal, total.
- Botones:
  - “Actualizar cantidad”
  - “Eliminar ítem”
  - “Vaciar carrito”
  - “Ir al checkout”

---

#### 🧠 Helpers usados en vistas

- `currency` → formatea números como `$ 1.234,56`
- `eq` → comparación simple (`if (eq a b)`)
- `json` → debug opcional
- `gte`, `lte` → filtros numéricos en catálogo

---

#### 🧭 Rutas del módulo

| Método | Ruta               | Descripción         | Auth    |
| :----- | :----------------- | :------------------ | :------ |
| GET    | `/`                | Catálogo público    | Público |
| GET    | `/products/:id`    | Detalle de producto | Público |
| GET    | `/cart`            | Ver carrito         | Público |
| POST   | `/cart/add/:id`    | Agregar producto    | Público |
| POST   | `/cart/update/:id` | Cambiar cantidad    | Público |
| POST   | `/cart/remove/:id` | Quitar producto     | Público |
| POST   | `/cart/clear`      | Vaciar carrito      | Público |

---

#### 🔐 Seguridad y middleware

- Carrito basado en `req.session`, con `connect-mongo`.
- Helmet CSP configurado para imágenes Cloudinary y scripts con `nonce`.
- Límite de 2 MB en archivos (config global).
- No requiere autenticación: todos los visitantes pueden comprar como invitado.

---

#### 🔗 Integraciones con otros módulos

| Módulo                         | Relación                                                 |
| :----------------------------- | :------------------------------------------------------- |
| **Módulo 1 (Usuarios)**        | Usa `setUserInViews` para mostrar nombre si hay sesión   |
| **Módulo 2 (Productos)**       | Fuente principal de datos (`Product.active = true`)      |
| **Módulo 4 (Checkout MP)**     | Utiliza `req.session.cart` como base para crear la orden |
| **Módulo 5 (Admin Dashboard)** | Consolida ventas y pedidos desde los datos del checkout  |

---

### MÓDULO 4 — Checkout + Mercado Pago (sandbox)

**Responsable:** _pendiente_  
**Alcance general:** crear **preferencias de pago** desde el carrito, gestionar las **return URLs** (`success|failure|pending`) y actualizar la colección **Order** con estado e identificadores de Mercado Pago.

---

#### 🧱 Responsabilidad general

Tomar el **carrito en sesión** (Módulo 3), crear una **Order** inicial (`status: "created"`), generar la **preferencia de Mercado Pago** (Checkout Pro), redirigir al usuario al flujo de pago y, al volver por return URL, **sincronizar el estado** de la orden (`approved`, `pending` o `rejected`), guardando los identificadores `mpPreferenceId` y `mpPaymentId` junto con los totales congelados del momento de compra.

> Este módulo completa el flujo de compra. No realiza validaciones de stock ni actualizaciones en productos (fuera del alcance académico).

---

#### 📂 Archivos y carpetas implicadas

```
ecommerce/
└─ src/
   ├─ services/
   │  └─ mp.service.js            # Crear preferencia MP (items, back_urls, auto_return)
   │
   ├─ models/
   │  └─ Order.js                 # Esquema de pedido (items, montos, estado MP)
   │
   ├─ controllers/
   │  └─ order.controller.js      # POST /checkout, returns, (opcional) webhook
   │
   ├─ routes/
   │  └─ checkout.js              # /checkout + /checkout/{success|failure|pending}
   │                              # (opcional) POST /webhooks/mp
   │
   └─ views/
      └─ checkout/                # Vistas de resultado del proceso de pago
         ├─ checkout.hbs          # Paso intermedio: confirmación (ver direcciones)
         ├─ success.hbs           # Pago aprobado
         ├─ pending.hbs           # Pago pendiente
         └─ failure.hbs           # Pago rechazado
```

> Requiere el **carrito** del **Módulo 3** y la **sesión + guardas** del **Módulo 1** (`requireAuth`).

---

#### 🧩 Modelo base (pedido)

```mermaid
erDiagram
  ORDER {
    string _id PK
    string userId FK
    number subtotal
    number discount
    number shippingFee "0 o 2000 (tarifa plana MVP)"
    string shippingMethod "pickup|delivery"
    string shippingAddressId "referencia a dirección guardada del usuario"
    number total
    string status "created|approved|pending|rejected"
    string mpPreferenceId
    string mpPaymentId
    date createdAt
  }

  ORDER ||--o{ ORDER_ITEM : contiene
  ORDER_ITEM {
    string _id PK
    string orderId FK
    string productId FK
    string title
    number price
    number qty
    number subtotal
  }
```

> Los totales (`subtotal`, `discount`, `total`) se guardan como valores **congelados**, independientes del precio actual del producto.

---

#### 🔄 Flujo principal (Checkout Pro)

```mermaid
sequenceDiagram
  participant U as Usuario
  participant S as Servidor
  participant DB as MongoDB
  participant MP as Mercado Pago

  U->>S: GET /checkout
  S-->>U: Render checkout.hbs (direcciones guardadas + resumen)
  U->>S: POST /checkout (fetch ó form)
  S->>DB: Crea Order(status="created", totales congelados + envío)
  S->>MP: mp.service.createPreference(items, back_urls)
  MP-->>S: { id, init_point, sandbox_init_point }
  S-->>U: JSON { url } (fetch) o Redirect 303 (form)

  U->>MP: Realiza pago (sandbox)
  MP-->>U: Return URL (/checkout/success|failure|pending?...params)
  U->>S: GET /checkout/success
  S->>DB: Actualiza Order(status, mpPaymentId, mpPreferenceId)
  S-->>U: Render success.hbs
```

---

#### 💳 Integración de Mercado Pago (SDK v2)

- Se usa el SDK oficial (`mercadopago`).
- Inicialización:

  ```js
  import { MercadoPagoConfig, Preference } from 'mercadopago';
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  ```

- Creación de preferencia (servidor):

  ```js
  const prefClient = new Preference(client);
  const pref = await prefClient.create({
    body: {
      items,
      back_urls: {
        success: `${BASE_URL}/checkout/success`,
        failure: `${BASE_URL}/checkout/failure`,
        pending: `${BASE_URL}/checkout/pending`,
      },
      auto_return: 'approved', // solo en entornos con dominio público
      external_reference: orderId,
      binary_mode: true,
    },
  });
  ```

- Respuesta esperada:

  ```json
  {
    "id": "1408843327-fc3c0104-c7ea-41ff-b82c-1f82401a5cd0",
    "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
    "sandbox_init_point": "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
  }
  ```

- En **entornos locales**, se usa `sandbox_init_point`.  
  En producción (`NODE_ENV=production`), se usa `init_point`.

---

#### ⚙️ Variables de entorno mínimas

```
MP_PUBLIC_KEY="TEST-..."
MP_ACCESS_TOKEN="TEST-..."
BASE_URL="http://localhost:8080"   # usada para back_urls en desarrollo
PORT=8080
NODE_ENV=development
```

> En producción, `BASE_URL` debe ser una URL pública accesible por Mercado Pago  
> (ej. `https://mi-tienda.onrender.com`).

---

#### 🔁 Manejo de returns y webhook (opcional)

**Return URLs**

```mermaid
graph TD
  A["GET /checkout/:result"] --> B["Lee query: preference_id, payment_id, status"]
  B --> C["Busca Order por preference_id o external_reference"]
  C --> D{"status"}
  D -->|approved| E["Order.status = 'approved'"]
  D -->|pending| F["Order.status = 'pending'"]
  D -->|failure| G["Order.status = 'rejected'"]
  E --> H["Render success.hbs"]
  F --> I["Render pending.hbs"]
  G --> J["Render failure.hbs"]
```

**Webhook (opcional)**

```mermaid
graph TD
  W["POST /webhooks/mp"] --> P["Valida topic/type/id"]
  P --> Q["Consulta detalle a MP (server-to-server)"]
  Q --> R["Upsert estado en Order según respuesta MP"]
  R --> S["200 OK"]
```

> En sandbox no es obligatorio.  
> Si se activa, deshabilitar CSRF en esa ruta y validar la firma (`x-signature`).

---

#### 🧮 Items, totales y envío (MVP)

- **Items:** `req.session.cart.items` con `{ title, price, qty }`.  
  Cada ítem incluye `subtotal = price * qty`.
- **Totales:** se congelan al crear la orden.
- **Método de envío:**
  - `pickup` → retiro en local → `shippingFee = 0`
  - `delivery` → envío a domicilio → `shippingFee = 2000` (tarifa plana)
- **Total final:** `total = cart.total + shippingFee`
- **Preferencia MP:** si `delivery`, agregar ítem:
  ```json
  { "title": "Envío a domicilio", "quantity": 1, "unit_price": 2000 }
  ```
- **Dirección:** se elige de `user.addresses`. No se crean nuevas en esta vista.
- **Estados posibles:** `created`, `approved`, `pending`, `rejected`.

---

#### 🧭 Rutas del módulo

| Método | Ruta                  | Descripción                                           | Auth    |
| -----: | --------------------- | ----------------------------------------------------- | ------- |
|    GET | `/checkout`           | Renderiza `checkout.hbs` (confirmación + direcciones) | Usuario |
|   POST | `/checkout`           | Crea Order + preferencia MP y devuelve URL de pago    | Usuario |
|    GET | `/checkout/success`   | Pago aprobado                                         | Usuario |
|    GET | `/checkout/pending`   | Pago pendiente                                        | Usuario |
|    GET | `/checkout/failure`   | Pago rechazado                                        | Usuario |
|   POST | `/webhooks/mp` (opt.) | Notificaciones server-to-server                       | Público |

---

#### 🧭 Flujo de vistas

| Vista                                         | Acción                       | Descripción                                  |
| --------------------------------------------- | ---------------------------- | -------------------------------------------- |
| `cart.hbs`                                    | Ir a pagar → GET `/checkout` | Redirige al checkout.                        |
| `checkout.hbs`                                | POST `/checkout` (fetch)     | Crea Order + Preferencia y redirige al pago. |
| `success.hbs` / `pending.hbs` / `failure.hbs` | Return URLs                  | Resultado final del pago.                    |

---

#### 📦 Controlador `POST /checkout`

- Verifica sesión y carrito.
- Crea la orden (`status: created`, totales congelados, ítems con `subtotal`).
- Llama al servicio `createPreference(cart, order._id)`.
- Guarda `mpPreferenceId` en la orden.
- Devuelve:
  - **AJAX/fetch:** JSON con `{ init_point, sandbox_init_point, url }`.
  - **Form HTML:** `303 Location` → redirección directa a MP.
- En sandbox redirige a `sandbox_init_point`, en prod a `init_point`.

---

#### 💰 Lógica de envío (tarifa plana $2000)

- Campo `shippingMethod`: `"pickup"` o `"delivery"`.
- Campo `shippingFee`: `0` o `2000`.
- Campo `shippingAddressId`: ID de dirección seleccionada.
- Cálculo final:
  ```js
  total = subtotal - discount + shippingFee;
  ```

---

#### 🔗 Interfaces con otros módulos

- **Módulo 1 (Usuarios):** `requireAuth`, `user.addresses`.
- **Módulo 3 (Carrito):** `req.session.cart`.
- **Módulo 5 (Admin/Panel):** Lectura de órdenes (`status`, `mpPaymentId`, etc.).

---

#### ✅ Requisitos UX clave

- Desde `cart.hbs` → botón **GET /checkout**.
- `checkout.hbs` muestra:
  - Métodos de entrega.
  - Direcciones guardadas.
  - Resumen del carrito.
- `POST /checkout`:
  - Crea `Order` + `Preferencia`.
  - Devuelve URL para pago (sandbox/prod).
  - Redirección automática desde el front.
- Al aprobar el pago:
  - Limpia el carrito en sesión.
  - Actualiza `status: approved`.

---

#### 🔚 Resultado esperado

- Checkout completamente funcional con **Mercado Pago (sandbox)**.
- Preferencias válidas y redirecciones automáticas.
- Órdenes sincronizadas con identificadores MP.
- Envío configurado con tarifa plana de $2000.
- Flujo completo: `Carrito → Checkout → Pago → Return URL`.
- Datos listos para visualizar en el Panel Admin (Módulo 5).

### MÓDULO 5 — Panel Admin (Dashboard + Pedidos)

**Responsable:** _pendiente_  
**Alcance general:** métricas rápidas (KPIs), listado y detalle de **pedidos**, y acciones mínimas de administración (cambio de estado manual opcional).

---

#### 🧱 Responsabilidad general

Proveer un **panel exclusivo para administradores** con vistas agregadas sobre las órdenes generadas por los usuarios:

- Panel de control (dashboard) con **indicadores clave** de ventas y actividad.
- Listado y detalle de **pedidos** creados en el **Módulo 4 (Checkout)**.
- Opcionalmente, permitir **actualizar el estado** de un pedido manualmente.

> Este módulo **no crea ni elimina pedidos**, solo los **consulta y actualiza**.

---

#### 📂 Archivos y carpetas implicadas

```
ecommerce/
└─ src/
   ├─ models/
   │  └─ Order.js                 # Lectura/actualización de pedidos
   │
   ├─ controllers/
   │  └─ admin.controller.js      # Acciones del dashboard y detalle de pedidos
   │
   ├─ routes/
   │  └─ admin/orders.js          # Rutas de pedidos (protegidas requireAdmin)
   │
   └─ views/
      └─ admin/
         ├─ dashboard.hbs         # KPIs: ventas totales, pedidos hoy, top productos
         └─ orders.hbs            # Listado + detalle (modal o página) y acciones
```

> Usa `requireAdmin` del **Módulo 1**.  
> Consume los documentos `Order` creados y actualizados en el **Módulo 4**.

---

#### 🔄 Flujos principales

**Acceso a Dashboard**

```mermaid
graph TD
  A["GET /admin"] --> B{"requireAdmin"}
  B --> N1["No"]
  N1 --> C["Redirect /"]
  B --> S1["Sí"]
  S1 --> D["Consultas agregadas sobre Order"]
  D --> E["Render admin/dashboard.hbs (KPIs)"]
```

**Gestión de Pedidos**

```mermaid
sequenceDiagram
  participant A as Admin
  participant S as Servidor
  participant DB as MongoDB

  A->>S: GET /admin/orders
  S->>DB: find().sort(createdAt desc).limit(paginado)
  DB-->>S: orders[]
  S-->>A: render orders.hbs

  A->>S: GET /admin/orders/:id
  S->>DB: findById(id).populate(items)
  DB-->>S: order
  S-->>A: render detalle (modal/página)

  A->>S: POST /admin/orders/:id/status (opcional)
  S->>DB: updateOne({_id:id}, {status})
  DB-->>S: OK
  S-->>A: redirect /admin/orders
```

---

#### 🧭 Rutas del módulo (admin)

| Método | Ruta                       | Descripción                        | Auth  |
| -----: | -------------------------- | ---------------------------------- | ----- |
|    GET | `/admin`                   | Dashboard KPIs                     | Admin |
|    GET | `/admin/orders`            | Listado de pedidos                 | Admin |
|    GET | `/admin/orders/:id`        | Detalle de pedido                  | Admin |
|   POST | `/admin/orders/:id/status` | Cambiar estado manual (_opcional_) | Admin |

---

#### 📊 KPIs sugeridos (consultas rápidas)

- **Ventas totales:** suma de `total` en órdenes con `status: "approved"`.
- **Pedidos del día:** conteo de órdenes con `createdAt` = hoy.
- **Top 5 productos:** agregación por `items.productId`, suma de `qty`.
- **Últimos pedidos:** lista con columnas (`fecha`, `cliente`, `estado`, `total`).

> Se obtienen con **consultas agregadas simples** en la colección `orders`.  
> No se almacenan métricas históricas ni estadísticas persistentes (lectura directa).

---

#### 🧩 Ejemplo de modelo consultado

```mermaid
erDiagram
  ORDER {
    string _id PK
    string userId FK
    number total
    string status "created|approved|pending|rejected"
    date createdAt
  }

  ORDER ||--o{ ORDER_ITEM : contiene
  ORDER_ITEM {
    string productId FK
    string title
    number price
    number qty
  }
```

---

#### 🔗 Interfaces con otros módulos

- **Lee** órdenes generadas por el **Módulo 4 (Checkout)**, incluyendo campos `status`, `mpPreferenceId` y `mpPaymentId`.
- **Muestra** productos del **Módulo 2 (CRUD de productos)**, accediendo a los datos dentro de cada `OrderItem`.
- **Requiere** las guardas de **Módulo 1** (`requireAdmin`).
- **Complementa** el flujo de compra mostrando resultados consolidados y métricas rápidas.
- Puede **extenderse** para listar usuarios o productos en versiones futuras del panel.

---

#### ⚙️ Consideraciones

- Todas las consultas son **read-only**, salvo el cambio manual de `status`.
- Los KPIs se recalculan **on-demand** sin caché.
- Las vistas `dashboard.hbs` y `orders.hbs` pueden compartir partials (`cards`, `tables`, etc.).
- El módulo puede integrarse con librerías de frontend (Chart.js, Bootstrap Tables) sin alterar el back-end.

---

### MÓDULO 6 — Seeds, Scripts y Entrega (Deploy en Render)

**Responsable:** _pendiente_  
**Alcance general:** generar la **semilla de datos** (admin + productos demo), definir **scripts npm mínimos** para ejecutar el proyecto y documentar una **guía corta de despliegue en Render**.

---

#### 🧱 Responsabilidad general

Dejar el proyecto **listo para probar en 5 minutos** mediante:

- Base de datos con **datos iniciales** (1 admin y ~10–12 productos demo).
- Scripts `npm` básicos (`dev`, `start`, `seed`).
- Archivo `.env.example` **completo** para clonar, configurar y desplegar.

> Este es el último módulo operativo. No modifica controladores ni vistas, solo prepara datos y configuración.

---

#### 📂 Archivos y carpetas implicadas

```
ecommerce/
├─ package.json                 # Scripts: dev, start, seed
├─ .env.example                 # Inventario completo de variables
└─ seed/
   └─ seed.js                   # Carga admin + productos demo (idempotente)
```

> Este módulo **no toca controladores ni vistas**.  
> Solo garantiza que el entorno de ejecución y los datos base estén disponibles.

---

#### 🧭 Scripts npm mínimos

- `"dev": "nodemon src/server/server.js"`
- `"start": "node src/server/server.js"`
- `"seed": "node seed/seed.js"`

> `seed.js` debe ser **idempotente**, es decir, poder ejecutarse varias veces sin duplicar datos (por ejemplo, usando `upsert` según `email` y `sku`).

---

#### 🌱 Contenido de la semilla

- **Usuario admin:** `admin@demo.test / 123456`  
  (`role: "admin"`, `active: true`)
- **Productos demo:** 10–12 ítems con `active:true`, algunos `featured`, con `imageUrl`.
  - Si Cloudinary **no está configurado**, usar imágenes locales o placeholders (`https://via.placeholder.com/...`).
- **Opcional:** incluir un par de productos con `promoEnabled/promoPct` para probar descuentos.

> La semilla es totalmente funcional sin conexión a Cloudinary (usa imágenes de respaldo).

---

#### 🔐 .env.example (inventario final)

```
# Core
PORT=3000
NODE_ENV=development
MONGO_URI="mongodb+srv://user:pass@cluster/dbname"
SESSION_SECRET="cambia-esto"

# Mercado Pago (sandbox)
MP_PUBLIC_KEY="TEST-..."
MP_ACCESS_TOKEN="TEST-..."
BASE_URL="http://localhost:3000"   # en Render será la URL pública

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Nodemailer (SMTP de tu preferencia)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."
DEFAULT_FROM="Ecommerce Demo <no-reply@demo.test>"
```

> En **Render**, asegurarse de configurar **todas** estas variables en la sección **Environment**.

---

#### 🚀 Deploy corto en Render (paso a paso)

1. **Conectar el repositorio GitHub** → _New Web Service_.
2. **Runtime:** Node 18+
3. **Root Directory:** `/` (raíz del proyecto)
4. **Build Command:** _(vacío o)_ `npm install`
5. **Start Command:** `npm start`
6. **Environment:** copiar las variables desde `.env.example` con valores reales
7. **PORT:** Render la detecta automáticamente
8. **MongoDB Atlas:** permitir IPs de Render en la allowlist
9. **Mercado Pago back_urls:** usar la URL pública de Render como `BASE_URL`

> Render no requiere pasos adicionales de build ni configuración de CI/CD.

---

#### 🔄 Flujo mínimo de despliegue

```mermaid
graph LR
  A["Repo GitHub"] --> B["Render: Deploy Web Service"]
  B --> C["Setear ENV (Mongo, MP, Cloudinary, SMTP)"]
  C --> D["npm start en Render"]
  D --> E["App online (demo funcional)"]
```

---

#### 🔗 Interacciones con otros módulos

- **Módulo 1:** crea el usuario administrador y valida sesiones.
- **Módulo 2:** provee productos demo para CRUD y catálogo.
- **Módulo 3:** usa los productos seed en el catálogo y carrito.
- **Módulo 4:** valida checkout con `BASE_URL` y credenciales de MP.
- **Módulo 5:** lee pedidos reales para calcular KPIs.

---

![crear web en render](readme_assets/image.png)

![alt text](image.png)
