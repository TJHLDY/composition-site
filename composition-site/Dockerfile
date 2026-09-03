FROM eclipse-temurin:17-jdk AS build
WORKDIR /workspace

COPY . /workspace

ENV MAVEN_OPTS="-Xmx512m"

RUN apt-get update \
  && apt-get install -y --no-install-recommends maven \
  && mvn -f composition-site/server/pom.xml -DskipTests package \
  && cp composition-site/server/target/fanwenjia-server-*.jar /workspace/app.jar \
  && rm -rf /var/lib/apt/lists/*

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /workspace/app.jar /app/app.jar

ENV JAVA_TOOL_OPTIONS="-Xms256m -Xmx512m"

CMD ["sh", "-c", "java -jar /app/app.jar --server.port=${PORT}"]
