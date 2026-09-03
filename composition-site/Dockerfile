FROM eclipse-temurin:17-jdk AS build
WORKDIR /workspace

COPY . /workspace

RUN apt-get update && apt-get install -y --no-install-recommends maven \
  && mvn -f server/pom.xml -DskipTests package \
  && rm -rf /var/lib/apt/lists/*

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /workspace/server/target/fanwenjia-server-*.jar /app/app.jar

EXPOSE 8088
ENV PORT=8088
ENV JAVA_TOOL_OPTIONS="-Xms256m -Xmx512m"

CMD ["sh", "-c", "java -jar /app/app.jar --server.port=${PORT}"]
