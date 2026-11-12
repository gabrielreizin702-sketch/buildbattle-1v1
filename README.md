# BuildBattle 1v1

Protótipo original de jogo 3D multiplayer inspirado no gênero construção + tiro.

## Requisitos
- Node.js 18 ou superior
- Navegador atualizado (Chrome, Edge ou Firefox)

## Rodar localmente
```bash
npm install
npm start
``
Abra http://localhost:3000.

## Jogar com um amigo
Os dois jogadores acessam o mesmo endereço público. Um cria uma sala privada e compartilha o código de quatro caracteres; o outro informa o código para entrar.

## Controles
- WASD: movimentar
- Shift: correr
- Espaço: pular
- Mouse: olhar / mirar
- Clique esquerdo: atirar
- Q: construir parede
- E: construir rampa
- F: construir piso
- ESC: liberar o cursor

## Estado do protótipo
Inclui arena 3D, salas privadas, sincronização de jogadores e construções, disparos, sistema de vida e colisão simplificada do jogador com paredes. Rampas e pisos ainda são principalmente visuais; a física de construção e a validação antitrapaça precisam de evolução.