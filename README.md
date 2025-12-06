# 🍽️ Pitéu

> **O fim do "Não sei, escolhe tu".**
>
> *Construído em 24 horas.*

**Pitéu** é uma aplicação web colaborativa desenhada para resolver o problema de decidir onde ir jantar em grupo. Utilizando uma mecânica de salas simples estilo "Kahoot" e o poder da AI, o Pitéu encontra o restaurante perfeito que agrada a gregos e troianos.

## ✨ Funcionalidades

* **⚡ Criação de Salas Rápidas:** Cria uma sala e partilha o código de 4 dígitos.
* **🥗 Perfil de Grupo Dinâmico:** Cada utilizador insere as suas preferências, restrições alimentares (ex: glúten, lactose).
* **🗺️ Google Maps Integration:** Busca locais reais e atualizados com base na localização central do grupo.
* **🤖 AI Powered Curator:** O **Gemini 2.5-fast-lite** analisa todas as restrições do grupo vs. os restaurantes encontrados, filtra as opções incompatíveis e gera uma descrição personalizada sobre o porquê daquela escolha ser a ideal.

## 🛠️ Tech Stack

Este projeto foi desenvolvido num sprint de **1 dia** utilizando as seguintes tecnologias:

* **Frontend:** [Next.js](https://nextjs.org/) (App Router), [Tailwind CSS](https://tailwindcss.com/)
* **Backend & Realtime:** [Supabase](https://supabase.com/) (PostgreSQL + Realtime Subscriptions)
* **Mapas & Dados:** [Google Maps Platform](https://developers.google.com/maps) (Places API)
* **Inteligência Artificial:** [Google Gemini API](https://ai.google.dev/) (Model: `gemini-2.5-fast-lite`)
