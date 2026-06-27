# Socket.IO como servicio separado

Para el MVP, Socket.IO correra como un servicio Node separado de Next.js. Elegimos esta separacion porque las conexiones persistentes no encajan bien con despliegues serverless de Next.js, mientras que un proceso realtime dedicado permite rooms por comunidad, sector y rol con validacion explicita de membresia `ACTIVE`; la alternativa de embeber Socket.IO en un custom Next server complicaria el despliegue y mezclaria responsabilidades.
