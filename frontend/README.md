# Peace Bundlle Frontend

A modern, enterprise-grade React application for the Peace Bundlle VTU platform.

## 🚀 Features

- **Enterprise-Grade Homepage**: Visually stunning, high-performance landing page.
- **Modern Tech Stack**: Built with React, TypeScript, Vite, and Tailwind CSS.
- **Performance Optimized**: Vanilla JS animations (Intersection Observer) for <2s LCP and zero dependency bloat.
- **Accessibility First**: WCAG 2.2 AA compliant with ARIA labels, keyboard navigation, and high contrast.
- **SEO Ready**: Dynamic metadata management, OpenGraph, and Twitter Cards support.
- **Privacy Compliance**: GDPR/CCPA compatible Cookie Consent banner.
- **Security**: Content Security Policy (CSP) and strict headers configuration.
- **Responsive Design**: Mobile-first approach supporting all device sizes (360px+).

## 🛠️ Architecture

- **Styling**: Tailwind CSS with a modular component structure.
- **Animations**: Custom hooks (`useInView`) and CSS transitions (no heavy animation libraries).
- **Routing**: React Router v6.
- **State Management**: React Hooks.
- **Testing**: Vitest + React Testing Library.

## 📘 UI Documentation

- **Design System**: `docs/design-system.md`
- **Implementation Guidelines**: `docs/implementation-guidelines.md`
- **Nigerian User Testing**: `docs/nigeria-user-testing.md`
- **Animation Reference**: `ANIMATION_GUIDE.md`

## 📦 Setup & Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd peace-bundle/frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Run tests**
   ```bash
   npm run test
   ```

## 🔍 Testing

The project includes automated tests for critical components.
- **Unit Tests**: Run `npm run test` to execute Vitest suites.
- **Accessibility**: Manual checks performed with Pa11y criteria.
- **Performance**: Lighthouse scores targeted at ≥95.

## 🚀 Deployment (Vercel)

This project is configured for seamless deployment on Vercel.

### 1. **Deployment Steps**
1. Push your code to a GitHub/GitLab/Bitbucket repository.
2. Connect your repository to Vercel.
3. Configure the following project settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Root Directory**: `frontend`

### 2. **Environment Variables**
Set the following environment variable in your Vercel project dashboard:
- `VITE_API_URL`: Your production backend API URL (e.g., `https://api.peacebundlle.com/api`).

### 3. **Routing (SPA)**
The `vercel.json` file handles all client-side routing, ensuring that all page requests are redirected to `index.html`.

## 🛡️ Security

- **CSP**: Configured in `index.html`.
- **HSTS**: Requires server-side configuration (e.g., Nginx, Vercel).
- **HTTPS**: Enforced in production.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---
© 2026 Peace Bundlle. All rights reserved.
