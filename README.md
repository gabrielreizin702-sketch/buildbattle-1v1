# BuildBattle 1v1

Protótipo original de jogo 3D multiplayer de construção e tiro, para partidas privadas 1v1 no navegador.

## Requisitos

- Node.js 18 ou superior
- Navegador atualizado (Chrome, Edge ou Firefox)

## Rodar localmente

```bash
npm install
npm start
```

Abra http://localhost:3000.

## Jogar com um amigo

Os dois jogadores acessam o mesmo endereço público. Um cria uma sala privada e compartilha o código de quatro caracteres; o outro informa o código para entrar. Cada sala aceita até dois jogadores.

## Controles

- WASD: movimentar
- Shift: correr
- Espaço: pular
- Mouse: olhar / mirar
- Clique esquerdo: atirar
- 1 / 2: trocar arma
- Q: construir parede
- E: construir rampa
- F: construir piso
- ESC: liberar o cursor

## Física de construção (v1.1)

- Paredes: colisão horizontal com caixa orientada pela rotação da peça.
- Pisos: suporte ao aterrissar pela parte superior e colisão com a parte inferior ao pular por baixo.
- Rampas: prisma sólido com superfície inclinada caminhável, suporte ao aterrissar e bloqueio das laterais.
- O servidor valida tipo, alcance, limite por rodada e intervalo mínimo entre construções; também define a altura da peça a partir da posição do jogador.
- O estado das construções continua sincronizado para os dois jogadores e é limpo ao reiniciar a rodada.

## Testes

Execute:

```bash
npm test
```

Os testes cobrem colisão com paredes rotacionadas, aterrissagem e permanência em pisos, inclinação e suporte de rampas, colisão com a parte inferior do piso e passagem acima de paredes.

## Limitações conhecidas

- A física é um sistema leve próprio, não um motor físico completo; o jogador é aproximado por um cilindro vertical.
- A simulação de movimento ainda é feita no cliente. O servidor valida a colocação de peças, mas não faz validação antitrapaça completa de movimento.
- Tiros ainda não são bloqueados por paredes e construções; isso fica para uma etapa posterior.
- Jogadores ainda não colidem fisicamente entre si.
